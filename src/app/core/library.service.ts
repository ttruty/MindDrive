import { Injectable, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { DriveApiService } from './drive-api.service';
import { parseFolderId } from './drive-url';
import { DriveNode, isPlayableMime } from './models';

export interface RootFolder {
  id: string;
  name: string;
}

export interface SyncSummary {
  syncedAt: string;
  /** CACHE_FORMAT at the time of the sync; an older format forces a re-sync. */
  format?: number;
  folders: number;
  sessions: number;
}

export interface SyncProgress {
  folders: number;
  sessions: number;
}

const ROOT_KEY = 'md.library.root';
const SYNC_KEY = 'md.library.lastSync';
/** Bump when DriveNode gains fields computed during sync, so existing caches get rebuilt. */
const CACHE_FORMAT = 2;
/** Automatic re-syncs (on startup / reconnect) only happen when the cache is older than this. */
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
/** Parallel files.list calls during a walk — enough to be quick, low enough to avoid rate limits. */
const WALK_CONCURRENCY = 4;

/**
 * The user's content library: which Drive folder is the root, and a cached mirror of its
 * tree (folders + playable files only) in the driveCache IndexedDB store.
 */
@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly db = inject(DbService);
  private readonly api = inject(DriveApiService);

  private readonly _root = signal<RootFolder | null>(readJson<RootFolder>(ROOT_KEY));
  private readonly _lastSync = signal<SyncSummary | null>(readJson<SyncSummary>(SYNC_KEY));
  private readonly _progress = signal<SyncProgress | null>(null);
  private readonly _syncError = signal<string | null>(null);
  private readonly _revision = signal(0);

  readonly root = this._root.asReadonly();
  readonly lastSync = this._lastSync.asReadonly();
  /** Non-null while a sync is running. */
  readonly progress = this._progress.asReadonly();
  readonly syncError = this._syncError.asReadonly();
  /** Bumps on every driveCache write (sync, clear, learned durations). Key cache reads on this. */
  readonly revision = this._revision.asReadonly();

  private currentSync: Promise<boolean> | null = null;

  /** Set the root from a pasted Drive folder link or ID, then sync. Throws on invalid input. */
  async setRootFromInput(input: string): Promise<RootFolder> {
    const id = parseFolderId(input);
    if (!id) throw new Error("That doesn't look like a Google Drive folder link or ID.");
    return this.setRoot(id);
  }

  /** Validate that `id` is an accessible folder, make it the root, then sync. */
  async setRoot(id: string): Promise<RootFolder> {
    const node = await this.api.getFile(id);
    if (!node.isFolder) throw new Error('That link points to a file, not a folder.');
    const root = { id: node.id, name: node.name };
    this._root.set(root);
    writeJson(ROOT_KEY, root);
    await this.sync();
    return root;
  }

  /**
   * Walk the whole tree under the root and replace driveCache with the result.
   * Resolves true on success; failures are reported via syncError. Concurrent calls share one run.
   */
  sync(): Promise<boolean> {
    this.currentSync ??= this.runSync().finally(() => (this.currentSync = null));
    return this.currentSync;
  }

  /** Sync only if a root is set and the cache is missing or stale. */
  syncIfStale(): Promise<boolean> {
    const last = this._lastSync();
    const fresh =
      last?.format === CACHE_FORMAT && Date.now() - Date.parse(last.syncedAt) < STALE_AFTER_MS;
    if (!this._root() || fresh) return Promise.resolve(false);
    return this.sync();
  }

  async getNode(id: string): Promise<DriveNode | undefined> {
    return (await this.db.db).get('driveCache', id);
  }

  /**
   * Cached children of a folder: subfolders first, then sessions, each in natural name order.
   * Folders with no sessions anywhere beneath them are left out.
   */
  async getChildren(parentId: string): Promise<DriveNode[]> {
    const children = await (await this.db.db).getAllFromIndex('driveCache', 'parentId', parentId);
    return children.filter((n) => !n.isFolder || n.sessionCount !== 0).sort(
      (a, b) =>
        Number(b.isFolder) - Number(a.isFolder) ||
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );
  }

  /**
   * The chain of folders from just below the root down to (and including) `id`.
   * Empty for the root itself or for nodes not in the cache.
   */
  async getTrail(id: string): Promise<DriveNode[]> {
    const db = await this.db.db;
    const trail: DriveNode[] = [];
    const seen = new Set<string>();
    let node = await db.get('driveCache', id);
    while (node && node.parentId !== null && !seen.has(node.id)) {
      seen.add(node.id);
      trail.unshift(node);
      node = await db.get('driveCache', node.parentId);
    }
    return trail;
  }

  /** Record a duration learned during playback (Drive only knows video durations). */
  async setDuration(id: string, durationMs: number): Promise<void> {
    const db = await this.db.db;
    const node = await db.get('driveCache', id);
    if (!node || node.isFolder || node.durationMs === durationMs) return;
    await db.put('driveCache', { ...node, durationMs });
    this._revision.update((r) => r + 1);
  }

  /** Every session anywhere beneath a folder, in browse order (depth-first). */
  async getDescendantSessions(folderId: string): Promise<DriveNode[]> {
    const out: DriveNode[] = [];
    for (const child of await this.getChildren(folderId)) {
      if (child.isFolder) out.push(...(await this.getDescendantSessions(child.id)));
      else out.push(child);
    }
    return out;
  }

  /** Forget the cached tree (the root folder setting is kept). */
  async clearCache(): Promise<void> {
    await (await this.db.db).clear('driveCache');
    this._revision.update((r) => r + 1);
    this._lastSync.set(null);
    localStorage.removeItem(SYNC_KEY);
  }

  private async runSync(): Promise<boolean> {
    const root = this._root();
    if (!root) return false;

    this._syncError.set(null);
    this._progress.set({ folders: 0, sessions: 0 });
    try {
      const rootNode = { ...(await this.api.getFile(root.id)), parentId: null };
      const nodes = await this.walk(rootNode);
      countSessions(nodes);

      const db = await this.db.db;
      carryOverDurations(nodes, await db.getAll('driveCache'));
      const tx = db.transaction('driveCache', 'readwrite');
      await tx.store.clear();
      await Promise.all([...nodes.map((n) => tx.store.put(n)), tx.done]);

      const summary: SyncSummary = {
        syncedAt: new Date().toISOString(),
        format: CACHE_FORMAT,
        folders: nodes.filter((n) => n.isFolder).length - 1, // exclude the root itself
        sessions: nodes.filter((n) => !n.isFolder).length,
      };
      this._lastSync.set(summary);
      this._revision.update((r) => r + 1);
      writeJson(SYNC_KEY, summary);
      if (rootNode.name !== root.name) {
        const renamed = { id: root.id, name: rootNode.name };
        this._root.set(renamed);
        writeJson(ROOT_KEY, renamed);
      }
      return true;
    } catch (err) {
      this._syncError.set(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      this._progress.set(null);
    }
  }

  /** Breadth-first walk keeping folders and playable files; everything else is dropped. */
  private async walk(rootNode: DriveNode): Promise<DriveNode[]> {
    const nodes: DriveNode[] = [rootNode];
    const visited = new Set([rootNode.id]);
    let level = [rootNode.id];
    let folders = 0;
    let sessions = 0;

    while (level.length) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += WALK_CONCURRENCY) {
        const batch = level.slice(i, i + WALK_CONCURRENCY);
        const results = await Promise.all(batch.map((id) => this.api.listChildren(id)));
        for (const child of results.flat()) {
          if (child.isFolder) {
            if (visited.has(child.id)) continue;
            visited.add(child.id);
            next.push(child.id);
            folders++;
          } else if (isPlayableMime(child.mimeType)) {
            sessions++;
          } else {
            continue;
          }
          nodes.push(child);
        }
        this._progress.set({ folders, sessions });
      }
      level = next;
    }
    return nodes;
  }
}

/**
 * Sets sessionCount on every folder. `nodes` is in breadth-first order, so walking it backwards
 * visits every child before its parent.
 */
function countSessions(nodes: DriveNode[]): void {
  const counts = new Map<string, number>();
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const own = node.isFolder ? (counts.get(node.id) ?? 0) : 1;
    if (node.isFolder) node.sessionCount = own;
    if (node.parentId) counts.set(node.parentId, (counts.get(node.parentId) ?? 0) + own);
  }
}

/** Keep durations learned during playback for files that haven't changed since. */
function carryOverDurations(nodes: DriveNode[], previous: DriveNode[]): void {
  const known = new Map(previous.filter((n) => n.durationMs).map((n) => [n.id, n]));
  for (const node of nodes) {
    const old = known.get(node.id);
    if (!node.durationMs && old && old.modifiedTime === node.modifiedTime) {
      node.durationMs = old.durationMs;
    }
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}
