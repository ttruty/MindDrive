import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { DB_NAME, DbService } from './db.service';

/** Resolves with the promise's outcome, or 'timeout' if it doesn't settle in `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([promise, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);
}

describe('DbService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('lets go of its connection when another context deletes or upgrades the database', async () => {
    const service = TestBed.inject(DbService);
    await service.db; // an open connection that nobody closes (e.g. another tab, or a leaked test)

    // Without a versionchange handler this blocks forever.
    expect(await within(deleteDB(DB_NAME), 2000)).not.toBe('timeout');

    // The service reopens on next use.
    const db = await service.db;
    expect([...db.objectStoreNames].sort()).toEqual(['driveCache', 'mediaBlobs', 'playback', 'streakLog']);
    db.close();
  });
});
