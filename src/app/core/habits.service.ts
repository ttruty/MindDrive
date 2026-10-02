import { Injectable, signal } from '@angular/core';
import { createReporter, localDateKey, type ReporterStatus } from './habits-reporter';
import type { PlaybackEntry } from './models';

const SETTINGS_KEY = 'minddrive.habits.v1';

interface HabitsSettings {
  enabled: boolean;
  url: string;
  token: string;
}

/**
 * Reporting finished sessions to a Habits scorecard (§17). Off until the listener turns it on
 * and pastes the URL and token from Habits → Sources; nothing is queued or sent while off.
 */
@Injectable({ providedIn: 'root' })
export class HabitsService {
  private readonly settings = signal<HabitsSettings>(this.read());
  readonly enabled = () => this.settings().enabled;
  readonly url = () => this.settings().url;
  readonly token = () => this.settings().token;
  readonly status = signal<ReporterStatus['state']>('off');

  private readonly reporter = createReporter({
    config: () => {
      const s = this.settings();
      return s.enabled && s.url.trim() && s.token.trim()
        ? { url: s.url.trim(), token: s.token.trim() }
        : null;
    },
    onStatus: (s) => this.status.set(s.state),
  });

  update(patch: Partial<HabitsSettings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings()));
    } catch {
      /* ignore */
    }
    if (this.enabled()) void this.reporter.flush();
  }

  /** A session played to the end: one per session per day. */
  reportCompleted(entry: PlaybackEntry, at = new Date()): void {
    const localDate = localDateKey(at);
    void this.reporter.report({
      externalId: `${entry.driveId}:${localDate}`,
      type: 'meditation.completed',
      occurredAt: at.toISOString(),
      localDate,
      ...(entry.durationSec ? { value: Math.round(entry.durationSec), unit: 'seconds' as const } : {}),
      meta: { folderPath: entry.folderPath, name: entry.name },
    });
  }

  private read(): HabitsSettings {
    const off = { enabled: false, url: '', token: '' };
    try {
      return { ...off, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
    } catch {
      return off;
    }
  }
}
