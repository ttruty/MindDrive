import { TestBed } from '@angular/core/testing';
import { HabitsService } from './habits.service';
import type { PlaybackEntry } from './models';

const entry: PlaybackEntry = {
  driveId: 's1',
  name: 'Body Scan.mp3',
  mimeType: 'audio/mpeg',
  parentId: 'sleep',
  folderPath: 'Sleep',
  positionSec: 0,
  durationSec: 600.4,
  completed: true,
  updatedAt: '2026-10-01T12:00:00.000Z',
};

const queued = () => JSON.parse(localStorage.getItem('habits.queue.v1') ?? '[]');
const settle = () => new Promise((r) => setTimeout(r));

describe('HabitsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('is off by default: nothing is queued', async () => {
    const habits = TestBed.inject(HabitsService);
    expect(habits.enabled()).toBe(false);
    habits.reportCompleted(entry);
    await settle();
    expect(queued()).toEqual([]);
  });

  it('stays off until both the URL and token are set', async () => {
    const habits = TestBed.inject(HabitsService);
    habits.update({ enabled: true, url: 'https://x.supabase.co/functions/v1/ingest' });
    habits.reportCompleted(entry);
    await settle();
    expect(queued()).toEqual([]);
  });

  it('queues a meditation.completed event, one per session per day', async () => {
    const habits = TestBed.inject(HabitsService);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    habits.update({ enabled: true, url: ' https://x.supabase.co/functions/v1/ingest ', token: 'hab_t' });
    const at = new Date(2026, 9, 1, 7, 30);
    habits.reportCompleted(entry, at);
    await settle();
    expect(queued()).toEqual([
      {
        externalId: 's1:2026-10-01',
        type: 'meditation.completed',
        occurredAt: at.toISOString(),
        localDate: '2026-10-01',
        value: 600,
        unit: 'seconds',
        meta: { folderPath: 'Sleep', name: 'Body Scan.mp3' },
      },
    ]);
  });

  it('remembers its settings', () => {
    TestBed.inject(HabitsService).update({ enabled: true, url: 'u', token: 't' });
    TestBed.resetTestingModule();
    const again = TestBed.inject(HabitsService);
    expect([again.enabled(), again.url(), again.token()]).toEqual([true, 'u', 't']);
  });
});
