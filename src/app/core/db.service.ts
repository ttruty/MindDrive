import { Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { DownloadedMedia, DriveNode, PlaybackEntry, StreakEntry } from './models';

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
  playback: {
    key: string;
    value: PlaybackEntry;
    indexes: { updatedAt: string };
  };
}

export const DB_NAME = 'minddrive';
const DB_VERSION = 2;

/** Owns the single IndexedDB connection. Each schema version adds its stores in `upgrade`. */
@Injectable({ providedIn: 'root' })
export class DbService {
  private dbPromise?: Promise<IDBPDatabase<MindDriveDB>>;

  get db(): Promise<IDBPDatabase<MindDriveDB>> {
    this.dbPromise ??= openDB<MindDriveDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          // The root node has parentId null, which IndexedDB simply leaves out of the index.
          const cache = db.createObjectStore('driveCache', { keyPath: 'id' });
          cache.createIndex('parentId', 'parentId');
          db.createObjectStore('mediaBlobs', { keyPath: 'driveId' });
          db.createObjectStore('streakLog', { keyPath: 'date' });
        }
        if (oldVersion < 2) {
          const playback = db.createObjectStore('playback', { keyPath: 'driveId' });
          playback.createIndex('updatedAt', 'updatedAt');
        }
      },
      // Another context (a tab running a newer version, or a delete) needs this connection gone.
      // Close it so they aren't blocked forever; the next `db` access reopens.
      blocking: (_current, _blocked, event) => {
        (event.target as IDBDatabase).close();
        this.dbPromise = undefined;
      },
      // The browser closed the connection abnormally (e.g. storage cleared): reopen on next access.
      terminated: () => {
        this.dbPromise = undefined;
      },
    });
    return this.dbPromise;
  }
}
