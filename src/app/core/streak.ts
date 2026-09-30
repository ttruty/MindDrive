import { StreakEntry } from './models';

/** 'YYYY-MM-DD' for a Date in the device's local time zone. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Calendar-day number for a date key — immune to DST because it ignores wall-clock time. */
function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export interface Streaks {
  /** Consecutive days ending today — or yesterday, so the streak survives until today is over. */
  current: number;
  longest: number;
  /** Whether today already counts. */
  practicedToday: boolean;
}

export function computeStreaks(dateKeys: Iterable<string>, today: Date): Streaks {
  const days = [...new Set([...dateKeys].map(dayNumber))].sort((a, b) => a - b);
  const todayNum = dayNumber(localDateKey(today));
  const has = new Set(days);

  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const practicedToday = has.has(todayNum);
  let current = 0;
  for (let day = practicedToday ? todayNum : todayNum - 1; has.has(day); day--) current++;

  return { current, longest, practicedToday };
}

export interface HeatmapCell {
  key: string;
  date: Date;
  count: number;
  /** 0 = none … 4 = most. */
  level: 0 | 1 | 2 | 3 | 4;
  /** After today (rest of the current week) — rendered empty. */
  future: boolean;
}

export interface HeatmapWeek {
  cells: HeatmapCell[];
  /** Short month name when this column contains the 1st–7th of a month, for the label row. */
  monthLabel: string | null;
}

/**
 * GitHub-style grid: `weeks` columns of 7 days (Sunday first), the last column being the
 * current week.
 */
export function buildHeatmap(entries: StreakEntry[], today: Date, weeks = 12): HeatmapWeek[] {
  const counts = new Map(entries.map((e) => [e.date, e.sessionsPlayed]));
  const todayKey = localDateKey(today);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - (weeks - 1) * 7);
  const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });

  const out: HeatmapWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const cells: HeatmapCell[] = [];
    let monthLabel: string | null = null;
    for (let d = 0; d < 7; d++) {
      // Constructing from components (not adding ms) keeps DST days at 24h.
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const key = localDateKey(date);
      const count = counts.get(key) ?? 0;
      if (date.getDate() <= 7 && d === 0) monthLabel = monthFmt.format(date);
      cells.push({ key, date, count, level: levelFor(count), future: key > todayKey });
    }
    out.push({ cells, monthLabel });
  }
  // Always label the first column so the grid is anchored in time.
  if (out.length && !out[0].monthLabel) out[0].monthLabel = monthFmt.format(out[0].cells[0].date);
  return out;
}

function levelFor(count: number): HeatmapCell['level'] {
  return count <= 0 ? 0 : count >= 4 ? 4 : (count as 1 | 2 | 3);
}
