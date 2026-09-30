import { Injectable, inject, signal } from '@angular/core';
import { displayName } from '../shared/display';
import { DbService } from './db.service';
import { LibraryService } from './library.service';
import { DriveNode, FavoriteEntry } from './models';

/** Hearted sessions, in the favorites IndexedDB store. Works fully offline. */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly db = inject(DbService);
  private readonly library = inject(LibraryService);

  private readonly _ids = signal<ReadonlySet<string>>(new Set());
  private readonly _revision = signal(0);

  /** Drive IDs of favorited sessions. */
  readonly ids = this._ids.asReadonly();
  /** Bumps on every change. Key favorite listings on this. */
  readonly revision = this._revision.asReadonly();

  /** Initial load from IndexedDB. Changes wait for it so a startup read can't overwrite them. */
  private readonly ready = this.refresh();

  isFavorite(id: string): boolean {
    return this._ids().has(id);
  }

  /** Add or remove; returns the new state. The UI updates immediately, storage follows. */
  async toggle(node: DriveNode): Promise<boolean> {
    if (this.isFavorite(node.id)) {
      await this.remove(node.id);
      return false;
    }
    await this.add(node);
    return true;
  }

  async add(node: DriveNode): Promise<void> {
    if (node.isFolder) return;
    await this.ready;
    this._ids.update((ids) => new Set(ids).add(node.id));
    const folders = (await this.library.getTrail(node.id)).filter((n) => n.isFolder);
    await (await this.db.db).put('favorites', {
      driveId: node.id,
      name: node.name,
      mimeType: node.mimeType,
      parentId: node.parentId,
      folderPath: folders.map((f) => displayName(f)).join(' / '),
      ...(node.durationMs ? { durationMs: node.durationMs } : {}),
      addedAt: new Date().toISOString(),
    });
    this._revision.update((r) => r + 1);
  }

  async remove(id: string): Promise<void> {
    await this.ready;
    this._ids.update((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
    await (await this.db.db).delete('favorites', id);
    this._revision.update((r) => r + 1);
  }

  /** Newest first. */
  async list(): Promise<FavoriteEntry[]> {
    return (await (await this.db.db).getAllFromIndex('favorites', 'addedAt')).reverse();
  }

  /**
   * Favorites as playable nodes. Uses the library cache when it knows the file (fresher name and
   * duration), else the favorite's own copy — so the list works offline or after a cache clear.
   */
  async listAsNodes(): Promise<{ node: DriveNode; folderPath: string }[]> {
    const entries = await this.list();
    return Promise.all(
      entries.map(async (e) => ({
        folderPath: e.folderPath,
        node: (await this.library.getNode(e.driveId)) ?? {
          id: e.driveId,
          name: e.name,
          parentId: e.parentId,
          mimeType: e.mimeType,
          isFolder: false,
          ...(e.durationMs ? { durationMs: e.durationMs } : {}),
        },
      })),
    );
  }

  private async refresh(): Promise<void> {
    try {
      this._ids.set(new Set(await (await this.db.db).getAllKeys('favorites')));
      this._revision.update((r) => r + 1);
    } catch {
      // Storage unavailable; pages show their load-error state.
    }
  }
}
