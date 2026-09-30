import { Injectable, computed, inject, signal } from '@angular/core';
import { displayName } from '../shared/display';
import { DbService } from './db.service';
import { DriveApiService } from './drive-api.service';
import { AuthRequiredError } from './google-auth.service';
import { LibraryService } from './library.service';
import { MediaSourceService, withMimeType } from './media-source.service';
import { DownloadedMedia, DriveNode } from './models';

export interface ActiveDownload {
  id: string;
  name: string;
  /** 0–1 once bytes are flowing; null while queued or when the size is unknown. */
  progress: number | null;
}

export interface StorageInfo {
  /** Bytes used by MindDrive's downloads (sum of stored blobs). */
  downloadsBytes: number;
  /** Browser-wide figures for this origin, when the Storage API provides them. */
  usageBytes?: number;
  quotaBytes?: number;
  persisted?: boolean;
}

/** Parallel downloads — enough to overlap latency without hogging a phone's connection. */
const CONCURRENCY = 2;

/**
 * Saves sessions into the mediaBlobs store for offline playback. MediaSourceService already
 * prefers these copies, so anything downloaded plays without a network.
 */
@Injectable({ providedIn: 'root' })
export class DownloadsService {
  private readonly db = inject(DbService);
  private readonly api = inject(DriveApiService);
  private readonly library = inject(LibraryService);
  private readonly mediaSource = inject(MediaSourceService);

  private readonly _ids = signal<ReadonlySet<string>>(new Set());
  private readonly _active = signal<ReadonlyMap<string, ActiveDownload>>(new Map());
  private readonly _revision = signal(0);
  private readonly _lastError = signal<{ message: string; at: number } | null>(null);

  /** Drive IDs with a stored copy. */
  readonly ids = this._ids.asReadonly();
  /** Queued + in-flight downloads, keyed by Drive ID. */
  readonly active = this._active.asReadonly();
  readonly activeList = computed(() => [...this._active().values()]);
  /** Bumps whenever mediaBlobs changes. Key download listings on this. */
  readonly revision = this._revision.asReadonly();
  /** Most recent failure (not cancellations), for a toast. */
  readonly lastError = this._lastError.asReadonly();

  private readonly queue: DriveNode[] = [];
  private readonly controllers = new Map<string, AbortController>();
  private running = 0;
  private persistRequested = false;

  constructor() {
    void this.refreshIds();
  }

  isDownloaded(id: string): boolean {
    return this._ids().has(id);
  }

  /** Queue a session. No-op if it's already stored or on its way. */
  download(node: DriveNode): void {
    this.enqueue([node]);
  }

  /** Queue every session not yet stored. Returns how many were added. */
  downloadAll(nodes: DriveNode[]): number {
    return this.enqueue(nodes);
  }

  cancel(id: string): void {
    const i = this.queue.findIndex((n) => n.id === id);
    if (i >= 0) this.queue.splice(i, 1);
    this.controllers.get(id)?.abort();
    this.setActive(id, null);
  }

  async remove(id: string): Promise<void> {
    await (await this.db.db).delete('mediaBlobs', id);
    await this.refreshIds();
  }

  async removeAll(): Promise<void> {
    for (const node of [...this.queue]) this.cancel(node.id);
    for (const id of this.controllers.keys()) this.cancel(id);
    await (await this.db.db).clear('mediaBlobs');
    await this.refreshIds();
  }

  /** All downloads, grouped-friendly order: by folder path, then title. */
  async list(): Promise<DownloadedMedia[]> {
    const all = await (await this.db.db).getAll('mediaBlobs');
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return all.sort(
      (a, b) =>
        collator.compare(a.folderPath, b.folderPath) ||
        collator.compare(displayName({ name: a.name, isFolder: false }), displayName({ name: b.name, isFolder: false })),
    );
  }

  async storageInfo(): Promise<StorageInfo> {
    const all = await (await this.db.db).getAll('mediaBlobs');
    const info: StorageInfo = { downloadsBytes: all.reduce((sum, d) => sum + downloadSize(d), 0) };
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate) {
        info.usageBytes = estimate.usage;
        info.quotaBytes = estimate.quota;
      }
      info.persisted = await navigator.storage?.persisted?.();
    } catch {
      // Storage API unavailable (older browsers / some private modes).
    }
    return info;
  }

  private enqueue(nodes: DriveNode[]): number {
    let added = 0;
    for (const node of nodes) {
      if (node.isFolder || this._ids().has(node.id) || this._active().has(node.id)) continue;
      this.queue.push(node);
      this.setActive(node.id, { id: node.id, name: displayName(node), progress: null });
      added++;
    }
    this.pump();
    return added;
  }

  private pump(): void {
    while (this.running < CONCURRENCY && this.queue.length) {
      const node = this.queue.shift()!;
      this.running++;
      void this.run(node).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async run(node: DriveNode): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(node.id, controller);
    try {
      const streamed = this.mediaSource.peekStreamed(node.id);
      const blob =
        streamed ??
        withMimeType(
          await this.api.downloadMedia(node.id, {
            signal: controller.signal,
            expectedBytes: node.sizeBytes,
            onProgress: (progress) => this.updateProgress(node.id, progress),
          }),
          node.mimeType,
        );
      if (controller.signal.aborted) return;

      const folders = (await this.library.getTrail(node.id)).filter((n) => n.isFolder);
      const record: DownloadedMedia = {
        driveId: node.id,
        name: node.name,
        folderPath: folders.map((f) => displayName(f)).join(' / '),
        parentId: node.parentId,
        mimeType: node.mimeType,
        blob,
        sizeBytes: blob.size,
        downloadedAt: new Date().toISOString(),
        ...(node.durationMs ? { durationMs: node.durationMs } : {}),
      };
      await (await this.db.db).put('mediaBlobs', record);
      this._ids.update((ids) => new Set(ids).add(node.id));
      this._revision.update((r) => r + 1);
      void this.requestPersistence();
    } catch (err) {
      if (controller.signal.aborted) return;
      this._lastError.set({
        message: `Couldn't download “${displayName(node)}”. ${describe(err)}`,
        at: Date.now(),
      });
    } finally {
      this.controllers.delete(node.id);
      this.setActive(node.id, null);
    }
  }

  private updateProgress(id: string, progress: number): void {
    const current = this._active().get(id);
    // Only re-emit on visible change (whole percents) to keep change detection cheap.
    if (current && Math.round((current.progress ?? -1) * 100) !== Math.round(progress * 100)) {
      this.setActive(id, { ...current, progress });
    }
  }

  private setActive(id: string, value: ActiveDownload | null): void {
    this._active.update((map) => {
      const next = new Map(map);
      if (value) next.set(id, value);
      else next.delete(id);
      return next;
    });
  }

  private async refreshIds(): Promise<void> {
    const keys = await (await this.db.db).getAllKeys('mediaBlobs');
    this._ids.set(new Set(keys));
    this._revision.update((r) => r + 1);
  }

  /** Ask the browser not to evict downloads under storage pressure. Once per session. */
  private async requestPersistence(): Promise<void> {
    if (this.persistRequested) return;
    this.persistRequested = true;
    try {
      if (!(await navigator.storage?.persisted?.())) await navigator.storage?.persist?.();
    } catch {
      // Not supported; downloads still work, they're just evictable.
    }
  }
}

export function downloadSize(item: DownloadedMedia): number {
  return item.sizeBytes ?? item.blob.size ?? 0;
}

function describe(err: unknown): string {
  if (err instanceof AuthRequiredError) return 'Reconnect Google Drive in Settings and try again.';
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'There isn’t enough storage space on this device.';
  }
  if (err instanceof TypeError || !navigator.onLine) return 'Check your connection and try again.';
  return err instanceof Error ? err.message : String(err);
}
