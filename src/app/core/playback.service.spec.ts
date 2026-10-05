import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { DB_NAME, DbService } from './db.service';
import { HabitsService } from './habits.service';
import { PlaybackService } from './playback.service';

const base = {
  driveId: 's1',
  name: 'Body Scan.mp3',
  mimeType: 'audio/mpeg',
  parentId: 'sleep',
  folderPath: 'Sleep',
};

describe('PlaybackService', () => {
  let service: PlaybackService;

  beforeEach(async () => {
    await deleteDB(DB_NAME);
    TestBed.configureTestingModule({});
    service = TestBed.inject(PlaybackService);
  });

  afterEach(async () => {
    (await TestBed.inject(DbService).db).close();
  });

  it('keeps a session marked done after a partial replay, and counts each finish', async () => {
    await service.save({ ...base, positionSec: 598, durationSec: 600 }); // finished
    expect(service.progress().get('s1')).toMatchObject({ done: true, inProgress: false });
    expect(await service.get('s1')).toMatchObject({ timesCompleted: 1 });

    await service.save({ ...base, positionSec: 120, durationSec: 600 }); // replaying, part-way
    expect(await service.get('s1')).toMatchObject({ completed: false, timesCompleted: 1 });
    expect(service.progress().get('s1')).toMatchObject({ done: true, inProgress: true, positionSec: 120 });

    await service.save({ ...base, positionSec: 599, durationSec: 600 }); // finished again
    await service.save({ ...base, positionSec: 0, durationSec: 600, completed: true }); // re-save, not a new finish
    expect(await service.get('s1')).toMatchObject({ timesCompleted: 2 });
    expect((await service.get('s1'))?.lastCompletedAt).toBeTruthy();
  });

  it('loads progress on startup, counting finishes saved before timesCompleted existed', async () => {
    const db = await TestBed.inject(DbService).db;
    await db.put('playback', { ...base, driveId: 'old', positionSec: 0, completed: true, updatedAt: 'x' });
    await db.put('playback', { ...base, driveId: 'mid', positionSec: 50, durationSec: 600, completed: false, updatedAt: 'x' });
    db.close();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.inject(PlaybackService);

    await vi.waitFor(() => expect(fresh.progress().size).toBe(2));
    expect(fresh.progress().get('old')).toMatchObject({ done: true, inProgress: false });
    expect(fresh.progress().get('mid')).toMatchObject({ done: false, inProgress: true });
    service = fresh; // so afterEach closes the right connection
  });

  it('resumes from a saved mid-session position', async () => {
    await service.save({ ...base, positionSec: 125, durationSec: 600 });
    expect(await service.resumePosition('s1')).toBe(125);
    expect((await service.get('s1'))?.completed).toBe(false);
  });

  it('starts over when new, barely started, or finished', async () => {
    expect(await service.resumePosition('s1')).toBe(0);

    await service.save({ ...base, positionSec: 3, durationSec: 600 });
    expect(await service.resumePosition('s1')).toBe(0);

    await service.save({ ...base, positionSec: 595, durationSec: 600 });
    expect(await service.get('s1')).toMatchObject({ completed: true, positionSec: 0 });
    expect(await service.resumePosition('s1')).toBe(0);

    await service.save({ ...base, positionSec: 300, completed: true });
    expect(await service.resumePosition('s1')).toBe(0);
  });

  it('lists recently played sessions newest first', async () => {
    await service.save({ ...base, driveId: 'a', positionSec: 10 });
    await new Promise((r) => setTimeout(r, 5));
    await service.save({ ...base, driveId: 'b', positionSec: 10 });
    await new Promise((r) => setTimeout(r, 5));
    await service.save({ ...base, driveId: 'a', positionSec: 20 });

    expect((await service.recent()).map((e) => e.driveId)).toEqual(['a', 'b']);
    expect(await service.recent(1)).toHaveLength(1);
  });

  it('reports a session to Habits once, when it first finishes', async () => {
    const report = vi.spyOn(TestBed.inject(HabitsService), 'reportCompleted');
    await service.save({ ...base, positionSec: 300, durationSec: 600 });
    expect(report).not.toHaveBeenCalled();

    await service.save({ ...base, positionSec: 595, durationSec: 600 });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toMatchObject({ driveId: 's1', completed: true });

    // Saving the finished session again isn't another completion…
    await service.save({ ...base, positionSec: 0, durationSec: 600, completed: true });
    expect(report).toHaveBeenCalledTimes(1);

    // …but playing it through again is.
    await service.save({ ...base, positionSec: 100, durationSec: 600 });
    await service.save({ ...base, positionSec: 598, durationSec: 600 });
    expect(report).toHaveBeenCalledTimes(2);
  });
});
