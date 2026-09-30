import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { DB_NAME, DbService } from './db.service';
import { StreakService } from './streak.service';

describe('StreakService', () => {
  let service: StreakService;

  beforeEach(async () => {
    await deleteDB(DB_NAME);
    TestBed.configureTestingModule({});
    service = TestBed.inject(StreakService);
  });

  afterEach(async () => {
    (await TestBed.inject(DbService).db).close();
  });

  it('counts sessions per local day', async () => {
    await service.recordSessionStart(new Date(2026, 8, 30, 7));
    await service.recordSessionStart(new Date(2026, 8, 30, 22));
    await service.recordSessionStart(new Date(2026, 9, 1, 0, 5));

    const entries = (await service.entries()).sort((a, b) => a.date.localeCompare(b.date));
    expect(entries).toEqual([
      { date: '2026-09-30', sessionsPlayed: 2 },
      { date: '2026-10-01', sessionsPlayed: 1 },
    ]);
    expect(service.revision()).toBe(3);
  });
});
