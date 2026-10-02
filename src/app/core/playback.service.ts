import { Injectable, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { HabitsService } from './habits.service';
import { PlaybackEntry } from './models';

/** Positions within this many seconds of the end count as finished. */
const COMPLETE_WITHIN_SEC = 10;
/** Don't bother resuming if the listener barely started. */
const MIN_RESUME_SEC = 5;

/** Resume positions and recently-played history (the `playback` IndexedDB store). */
@Injectable({ providedIn: 'root' })
export class PlaybackService {
  private readonly db = inject(DbService);
  private readonly habits = inject(HabitsService);
  private readonly _revision = signal(0);

  /** Bumps on every save. Key "Continue listening"-style displays on this. */
  readonly revision = this._revision.asReadonly();

  async get(driveId: string): Promise<PlaybackEntry | undefined> {
    return (await this.db.db).get('playback', driveId);
  }

  /** Where to start a session: its saved position, or 0 if new, barely started or finished. */
  async resumePosition(driveId: string): Promise<number> {
    const entry = await this.get(driveId);
    if (!entry || entry.completed || entry.positionSec < MIN_RESUME_SEC) return 0;
    if (entry.durationSec && entry.positionSec > entry.durationSec - COMPLETE_WITHIN_SEC) return 0;
    return entry.positionSec;
  }

  async save(
    entry: Omit<PlaybackEntry, 'updatedAt' | 'completed'> & { completed?: boolean },
  ): Promise<void> {
    const nearEnd =
      !!entry.durationSec && entry.positionSec >= entry.durationSec - COMPLETE_WITHIN_SEC;
    const completed = entry.completed ?? nearEnd;
    const db = await this.db.db;
    const wasCompleted = (await db.get('playback', entry.driveId))?.completed ?? false;
    const saved: PlaybackEntry = {
      ...entry,
      positionSec: completed ? 0 : entry.positionSec,
      completed,
      updatedAt: new Date().toISOString(),
    };
    await db.put('playback', saved);
    this._revision.update((r) => r + 1);
    // Finishing a session is a completion for Habits (§17); later saves of a finished one aren't.
    if (completed && !wasCompleted) this.habits.reportCompleted(saved);
  }

  /** Most recently played sessions first. */
  async recent(limit = 10): Promise<PlaybackEntry[]> {
    const db = await this.db.db;
    const out: PlaybackEntry[] = [];
    let cursor = await db.transaction('playback').store.index('updatedAt').openCursor(null, 'prev');
    while (cursor && out.length < limit) {
      out.push(cursor.value);
      cursor = await cursor.continue();
    }
    return out;
  }
}
