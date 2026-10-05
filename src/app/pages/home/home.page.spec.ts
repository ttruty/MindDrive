import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { deleteDB } from 'idb';
import { DB_NAME, DbService } from '../../core/db.service';
import { DriveNode, FOLDER_MIME } from '../../core/models';
import { localDateKey } from '../../core/streak';

import { HomePage } from './home.page';

const folder = (id: string, name: string, parentId: string | null): DriveNode => ({
  id, name, parentId, mimeType: FOLDER_MIME, isFolder: true, sessionCount: 1,
});
const file = (id: string, parentId: string): DriveNode => ({
  id, name: `${id}.mp3`, parentId, mimeType: 'audio/mpeg', isFolder: false,
});

function daysAgo(n: number): string {
  const d = new Date();
  return localDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, 12));
}

describe('HomePage', () => {
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    localStorage.clear();
    await deleteDB(DB_NAME);
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([])] });
  });

  afterEach(async () => {
    (await TestBed.inject(DbService).db).close();
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.data.hasValue()).toBe(true));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('welcomes new users', async () => {
    const el = await render();
    expect(el.textContent).toContain('Welcome to MindDrive');
  });

  it('features the current category with progress and the next session to play', async () => {
    localStorage.setItem('md.library.root', JSON.stringify({ id: 'root', name: 'Library' }));
    localStorage.setItem('md.currentCategory', JSON.stringify({ id: 'sleep', name: 'Sleep', setAt: 'x' }));
    const db = await TestBed.inject(DbService).db;
    for (const n of [
      folder('root', 'Library', null),
      folder('sleep', 'Sleep', 'root'),
      file('s1', 'sleep'),
      { ...file('s2', 'sleep'), name: '02 - Wind Down.mp3', durationMs: 600_000 },
      file('s3', 'sleep'),
    ]) {
      await db.put('driveCache', n);
    }
    await db.put('playback', {
      driveId: 's1', name: 's1.mp3', mimeType: 'audio/mpeg', parentId: 'sleep', folderPath: 'Sleep',
      positionSec: 0, completed: true, timesCompleted: 1, updatedAt: new Date().toISOString(),
    });

    const el = await render();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('.current__title')?.textContent).toBe('Sleep');
    });
    expect(el.querySelector('.current__meta')?.textContent?.trim()).toBe('1 of 3 done');
    expect(el.querySelector('.current__next-label')?.textContent).toBe('Up next');
    expect(el.querySelector('.current__next-title')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Wind Down · 10 min');
  });

  it('shows the streak, continue listening, and recently played categories first', async () => {
    localStorage.setItem('md.library.root', JSON.stringify({ id: 'root', name: 'Library' }));
    const db = await TestBed.inject(DbService).db;
    for (const n of [
      folder('root', 'Library', null),
      folder('anx', 'Anxiety', 'root'),
      folder('focus', 'Focus', 'root'),
      folder('sleep', 'Sleep', 'root'),
      folder('stories', 'Stories', 'sleep'),
      file('s1', 'stories'),
      file('f1', 'focus'),
    ]) {
      await db.put('driveCache', n);
    }
    // 3-day streak ending yesterday; a 5-day run last month.
    for (const n of [1, 2, 3, 30, 31, 32, 33, 34]) {
      await db.put('streakLog', { date: daysAgo(n), sessionsPlayed: 1 });
    }
    const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    await db.put('playback', {
      driveId: 's1', name: '01 - Night Story.mp3', mimeType: 'audio/mpeg', parentId: 'stories',
      folderPath: 'Sleep / Stories', positionSec: 300, durationSec: 900, completed: false, updatedAt: at(5),
    });
    await db.put('playback', {
      driveId: 'f1', name: 'f1.mp3', mimeType: 'audio/mpeg', parentId: 'focus',
      folderPath: 'Focus', positionSec: 0, durationSec: 600, completed: true, updatedAt: at(60),
    });

    const el = await render();

    expect(el.querySelector('.streak__number')?.textContent).toBe('3');
    expect(el.querySelector('.streak__longest')?.textContent).toContain('Longest 5 days');
    expect(el.querySelector('.streak__message')?.textContent).toContain('keep your 3-day streak');
    expect(el.querySelectorAll('.heatmap__grid > span')).toHaveLength(84);

    expect(el.querySelector('.resume__title')?.textContent).toBe('Night Story');
    expect(el.querySelector('.resume__meta')?.textContent).toBe('Sleep / Stories · 10 min left');

    const picks = [...el.querySelectorAll('app-category-card .card__title')].map((t) => t.textContent);
    expect(picks).toEqual(['Sleep', 'Focus', 'Anxiety']);
  });
});
