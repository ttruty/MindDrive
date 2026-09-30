import { Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { flame, trophyOutline } from 'ionicons/icons';
import { HeatmapWeek, Streaks } from '../../../core/streak';

const DAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** Current/longest streak plus a 12-week GitHub-style heatmap. */
@Component({
  selector: 'app-streak-card',
  templateUrl: 'streak-card.component.html',
  styleUrls: ['streak-card.component.scss'],
  imports: [IonIcon],
})
export class StreakCardComponent {
  readonly streaks = input.required<Streaks>();
  readonly weeks = input.required<HeatmapWeek[]>();

  readonly message = computed(() => {
    const { current, longest, practicedToday } = this.streaks();
    if (practicedToday) return 'You’ve practiced today. See you tomorrow.';
    if (current > 0) return `Play any session today to keep your ${current}-day streak going.`;
    if (longest > 0) return 'Start a fresh streak today — any session counts.';
    return 'Play any session to start your streak.';
  });

  readonly summary = computed(() => {
    const cells = this.weeks().flatMap((w) => w.cells);
    const sessions = cells.reduce((sum, c) => sum + c.count, 0);
    const days = cells.filter((c) => c.count > 0).length;
    return `Practice over the last ${this.weeks().length} weeks: ${sessions} sessions on ${days} days`;
  });

  constructor() {
    addIcons({ flame, trophyOutline });
  }

  cellLabel(date: Date, count: number): string {
    const what = count === 0 ? 'No sessions' : count === 1 ? '1 session' : `${count} sessions`;
    return `${DAY_FMT.format(date)}: ${what}`;
  }
}
