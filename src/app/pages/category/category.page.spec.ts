import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { deleteDB } from 'idb';
import { DB_NAME, DbService } from '../../core/db.service';
import { DriveNode, FOLDER_MIME } from '../../core/models';

import { CategoryPage } from './category.page';

const nodes: DriveNode[] = [
  { id: 'root', name: 'Library', parentId: null, mimeType: FOLDER_MIME, isFolder: true, sessionCount: 3 },
  { id: 'sleep', name: 'Sleep', parentId: 'root', mimeType: FOLDER_MIME, isFolder: true, sessionCount: 3 },
  { id: 'deep', name: '01 - Deep Rest', parentId: 'sleep', mimeType: FOLDER_MIME, isFolder: true, sessionCount: 2 },
  { id: 'empty', name: 'Empty', parentId: 'sleep', mimeType: FOLDER_MIME, isFolder: true, sessionCount: 0 },
  { id: 'wind', name: '02_wind_down.mp4', parentId: 'sleep', mimeType: 'video/mp4', isFolder: false, durationMs: 600_000 },
  { id: 'a', name: 'a.mp3', parentId: 'deep', mimeType: 'audio/mpeg', isFolder: false },
  { id: 'b', name: 'b.mp3', parentId: 'deep', mimeType: 'audio/mpeg', isFolder: false },
];

describe('CategoryPage', () => {
  let fixture: ComponentFixture<CategoryPage>;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('md.library.root', JSON.stringify({ id: 'root', name: 'Library' }));
    localStorage.setItem(
      'md.library.lastSync',
      JSON.stringify({ syncedAt: new Date().toISOString(), folders: 3, sessions: 3, format: 2 }),
    );
    await deleteDB(DB_NAME);
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([])] });
    const db = await TestBed.inject(DbService).db;
    await Promise.all(nodes.map((n) => db.put('driveCache', n)));
  });

  afterEach(async () => {
    (await TestBed.inject(DbService).db).close();
  });

  function crumbs(el: HTMLElement): string[] {
    return [...el.querySelectorAll('.crumbs button, .crumbs span')].map((c) => c.textContent!.trim());
  }

  async function render(folderId: string): Promise<HTMLElement> {
    fixture = TestBed.createComponent(CategoryPage);
    fixture.componentRef.setInput('folderId', folderId);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows breadcrumbs, non-empty subcategories and sessions', async () => {
    const el = await render('sleep');

    expect(crumbs(el)).toEqual(['Explore', 'Sleep']);
    const cards = [...el.querySelectorAll('app-category-card')].map((c) => [
      c.querySelector('.card__title')?.textContent,
      c.querySelector('.card__count')?.textContent,
    ]);
    expect(cards).toEqual([['Deep Rest', '2 sessions']]);
    expect(el.querySelector('app-session-list')?.textContent).toContain('wind down');
    expect(el.querySelector('app-session-list')?.textContent).toContain('Video · 10 min');
  });

  it('includes ancestors in the breadcrumb for nested categories', async () => {
    const el = await render('deep');
    expect(crumbs(el)).toEqual(['Explore', 'Sleep', 'Deep Rest']);
  });

  it('explains when the category is no longer in the library', async () => {
    const el = await render('missing');
    expect(el.textContent).toContain('This category has moved');
  });
});
