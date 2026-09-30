import {
  categoryAppearance,
  displayName,
  formatClock,
  formatDuration,
  sessionCountLabel,
} from './display';

describe('displayName', () => {
  const file = (name: string) => displayName({ name, isFolder: false });

  it('drops extensions, track numbers and underscores from files', () => {
    expect(file('01 - Body Scan.mp3')).toBe('Body Scan');
    expect(file('2. Morning_Stretch.m4a')).toBe('Morning Stretch');
    expect(file('03_deep_rest.mp4')).toBe('deep rest');
  });

  it('keeps numbers that are part of the title', () => {
    expect(file('3 Minute Breathing.mp3')).toBe('3 Minute Breathing');
  });

  it('never strips a folder name down to nothing', () => {
    expect(displayName({ name: '01.', isFolder: true })).toBe('01.');
    expect(displayName({ name: 'Sleep.Stories', isFolder: true })).toBe('Sleep.Stories');
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(45_000)).toBe('45 sec');
    expect(formatDuration(12 * 60_000 + 20_000)).toBe('12 min');
    expect(formatDuration(65 * 60_000)).toBe('1 hr 5 min');
    expect(formatDuration(120 * 60_000)).toBe('2 hr');
  });
});

describe('sessionCountLabel', () => {
  it('pluralises', () => {
    expect(sessionCountLabel(1)).toBe('1 session');
    expect(sessionCountLabel(4)).toBe('4 sessions');
    expect(sessionCountLabel(undefined)).toBe('');
  });
});

describe('categoryAppearance', () => {
  it('picks icons from keywords and is stable per id', () => {
    expect(categoryAppearance({ id: 'a', name: 'Sleep Stories' }).icon).toBe('moon');
    expect(categoryAppearance({ id: 'b', name: 'Deep Focus' }).icon).toBe('bulb');
    expect(categoryAppearance({ id: 'x', name: 'Misc' })).toEqual(
      categoryAppearance({ id: 'x', name: 'Misc' }),
    );
  });
});

describe('formatClock', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(3729)).toBe('1:02:09');
    expect(formatClock(NaN)).toBe('0:00');
    expect(formatClock(-4)).toBe('0:00');
  });
});
