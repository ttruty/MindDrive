import { Injectable, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { HabitsService } from './habits.service';
import { PlaybackEntry } from './models';

/** Positions within this many seconds of the end count as finished. */
const COMPLETE_WITHIN_SEC = 10;
/** Don't bother resuming if the listener barely started. */
const MIN_RESUME_SEC = 5;

/** What the lists need to know about one session's listening history. */
export interface SessionProgress {
  /** Played to the end at least once. */
  done: boolean;
  /** Part-way through right now (saved position, not finished this time). */
  inProgress: boolean;
  positionSec: number;
  durationSec?: number;
}

/** Finished at least once — counting entries saved before `timesCompleted` existed. */
export function timesCompleted(entry: Pick<PlaybackEntry, 'timesCompleted' | 'completed'>): number {
  return entry.timesCompleted ?? (entry.completed ? 1 : 0);
}

function toProgress(e: PlaybackEntry): SessionProgress {
  return {
    done: timesCompleted(e) > 0,
    inProgress: !e.completed && e.positionSec > 0,
    positionSec: e.positionSec,
    ...(e.durationSec ? { durationSec: e.durationSec } : {}),
  };
}

/** Resume positions and recently-played history (the `playback` IndexedDB store). */
@Injectable({ providedIn: 'root' })
export class PlaybackService {
  private readonly db = inject(DbService);
  private readonly habits = inject(HabitsService);
  private readonly _revision = signal(0);
  private readonly _progress = signal<ReadonlyMap<string, SessionProgress>>(new Map());

  /** Bumps on every save. Key "Continue listening"-style displays on this. */
  readonly revision = this._revision.asReadonly();
  /** Per-session done / in-progress state, kept in sync with every save. Drives the "done" marks. */
  readonly progress = this._progress.asReadonly();

  constructor() {
    void this.loadProgress();
  }

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
    const previous = await db.get('playback', entry.driveId);
    const wasCompleted = previous?.completed ?? false;
    const justFinished = completed && !wasCompleted;
    const now = new Date().toISOString();
    const finishedBefore = previous ? timesCompleted(previous) : 0;
    const saved: PlaybackEntry = {
      ...entry,
      positionSec: completed ? 0 : entry.positionSec,
      completed,
      updatedAt: now,
      timesCompleted: finishedBefore + (justFinished ? 1 : 0),
      ...(justFinished ? { lastCompletedAt: now } : previous?.lastCompletedAt ? { lastCompletedAt: previous.lastCompletedAt } : {}),
    };
    await db.put('playback', saved);
    this._progress.update((map) => new Map(map).set(saved.driveId, toProgress(saved)));
    this._revision.update((r) => r + 1);
    // Finishing a session is a completion for Habits (§17); later saves of a finished one aren't.
    if (completed && !wasCompleted) this.habits.reportCompleted(saved);
  }

  private async loadProgress(): Promise<void> {
    try {
      const all = await (await this.db.db).getAll('playback');
      this._progress.set(new Map(all.map((e) => [e.driveId, toProgress(e)])));
    } catch {
      // Storage unavailable; pages show their load-error state.
    }
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
