import { Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { DownloadedMedia, DriveNode, StreakEntry } from './models';

export interface MindDriveDB extends DBSchema {
  driveCache: {
    key: string;
    value: DriveNode;
    indexes: { parentId: string };
  };
  mediaBlobs: {
    key: string;
    value: DownloadedMedia;
  };
  streakLog: {
    key: string;
    value: StreakEntry;
  };
}

export const DB_NAME = 'minddrive';
const DB_VERSION = 1;

/** Owns the single IndexedDB connection. All three stores are created up front. */
@Injectable({ providedIn: 'root' })
export class DbService {
  private dbPromise?: Promise<IDBPDatabase<MindDriveDB>>;

  get db(): Promise<IDBPDatabase<MindDriveDB>> {
    this.dbPromise ??= openDB<MindDriveDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // The root node has parentId null, which IndexedDB simply leaves out of the index.
        const cache = db.createObjectStore('driveCache', { keyPath: 'id' });
        cache.createIndex('parentId', 'parentId');
        db.createObjectStore('mediaBlobs', { keyPath: 'driveId' });
        db.createObjectStore('streakLog', { keyPath: 'date' });
      },
    });
    return this.dbPromise;
  }
}
