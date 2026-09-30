import { Injectable, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { StreakEntry } from './models';
import { localDateKey } from './streak';

/** Writes the streakLog store: one entry per local day with any playback. */
@Injectable({ providedIn: 'root' })
export class StreakService {
  private readonly db = inject(DbService);
  private readonly _revision = signal(0);

  /** Bumps on every write. Key streak displays on this. */
  readonly revision = this._revision.asReadonly();

  /** Count a session started now (any length counts toward the streak). */
  async recordSessionStart(at: Date = new Date()): Promise<void> {
    const db = await this.db.db;
    const tx = db.transaction('streakLog', 'readwrite');
    const date = localDateKey(at);
    const existing = await tx.store.get(date);
    await tx.store.put({ date, sessionsPlayed: (existing?.sessionsPlayed ?? 0) + 1 });
    await tx.done;
    this._revision.update((r) => r + 1);
  }

  async entries(): Promise<StreakEntry[]> {
    return (await this.db.db).getAll('streakLog');
  }
}
