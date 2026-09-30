import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { deleteDB } from 'idb';
import { DB_NAME, DbService } from '../../core/db.service';
import { DownloadedMedia } from '../../core/models';

import { DownloadsPage } from './downloads.page';

const item = (driveId: string, name: string, folderPath: string): DownloadedMedia => ({
  driveId,
  name,
  folderPath,
  mimeType: 'audio/mpeg',
  blob: new Blob([new Uint8Array(2048)], { type: 'audio/mpeg' }),
  sizeBytes: 2048,
  downloadedAt: new Date().toISOString(),
});

describe('DownloadsPage', () => {
  let fixture: ComponentFixture<DownloadsPage>;

  beforeEach(async () => {
    await deleteDB(DB_NAME);
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([])] });
  });

  afterEach(async () => {
    (await TestBed.inject(DbService).db).close();
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(DownloadsPage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.contents.hasValue()).toBe(true));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the empty state with nothing downloaded', async () => {
    const el = await render();
    expect(el.textContent).toContain('Listen anywhere');
  });

  it('groups downloads by folder with sizes', async () => {
    const db = await TestBed.inject(DbService).db;
    await db.put('mediaBlobs', item('a', '02 - Night Train.mp3', 'Sleep / Stories'));
    await db.put('mediaBlobs', item('b', '01 - Lighthouse.mp3', 'Sleep / Stories'));
    await db.put('mediaBlobs', item('c', 'Focus 10.mp3', 'Focus'));

    const el = await render();
    const headings = [...el.querySelectorAll('h2.md-section-title')].map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Focus', 'Sleep / Stories']);
    const titles = [...el.querySelectorAll('.dl-row__title')].map((t) => t.textContent?.trim());
    expect(titles).toEqual(['Focus 10', 'Lighthouse', 'Night Train']);
    expect(el.querySelector('.dl-row__meta')?.textContent).toBe('Audio · 2 KB');
    expect(el.querySelector('.storage__headline')?.textContent).toContain('3 sessions');
  });
});
