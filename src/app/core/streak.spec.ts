import { buildHeatmap, computeStreaks, localDateKey } from './streak';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe('localDateKey', () => {
  it('uses local calendar components', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});

describe('computeStreaks', () => {
  const today = day(2026, 9, 30);

  it('counts a run ending today', () => {
    expect(computeStreaks(['2026-09-28', '2026-09-29', '2026-09-30'], today)).toEqual({
      current: 3,
      longest: 3,
      practicedToday: true,
    });
  });

  it('keeps the streak alive until today is over', () => {
    expect(computeStreaks(['2026-09-28', '2026-09-29'], today)).toMatchObject({
      current: 2,
      practicedToday: false,
    });
  });

  it('resets after a missed day but remembers the longest run', () => {
    const keys = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-27', '2026-09-28'];
    expect(computeStreaks(keys, today)).toEqual({ current: 0, longest: 4, practicedToday: false });
  });

  it('handles empty logs, duplicates, month/year boundaries and DST', () => {
    expect(computeStreaks([], today)).toEqual({ current: 0, longest: 0, practicedToday: false });
    expect(computeStreaks(['2025-12-31', '2026-01-01', '2026-01-01'], day(2026, 1, 1)).current).toBe(2);
    // US & EU DST changes: March 8 / March 29, 2026.
    expect(computeStreaks(['2026-03-07', '2026-03-08', '2026-03-09'], day(2026, 3, 9)).current).toBe(3);
    expect(computeStreaks(['2026-03-28', '2026-03-29', '2026-03-30'], day(2026, 3, 30)).current).toBe(3);
  });
});

describe('buildHeatmap', () => {
  const today = day(2026, 9, 30); // a Wednesday

  it('builds 12 Sunday-first weeks ending with the current week', () => {
    const weeks = buildHeatmap([], today);
    expect(weeks).toHaveLength(12);
    expect(weeks.every((w) => w.cells.length === 7)).toBe(true);
    expect(weeks[0].cells[0].date.getDay()).toBe(0);
    const last = weeks[11].cells;
    expect(last[3].key).toBe('2026-09-30');
    expect(last.map((c) => c.future)).toEqual([false, false, false, false, true, true, true]);
    expect(weeks[0].cells[0].key).toBe('2026-07-12');
  });

  it('maps counts to levels and labels month starts', () => {
    const weeks = buildHeatmap(
      [
        { date: '2026-09-30', sessionsPlayed: 1 },
        { date: '2026-09-29', sessionsPlayed: 3 },
        { date: '2026-09-28', sessionsPlayed: 9 },
      ],
      today,
    );
    expect(weeks[11].cells.slice(1, 4).map((c) => c.level)).toEqual([4, 3, 1]);
    expect(weeks[0].monthLabel).toBeTruthy();
    expect(weeks.filter((w) => w.monthLabel).length).toBeGreaterThanOrEqual(3); // Jul, Aug, Sep
  });
});
