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
