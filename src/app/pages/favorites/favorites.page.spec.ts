import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { deleteDB } from 'idb';
import { DB_NAME, DbService } from '../../core/db.service';
import { FavoritesService } from '../../core/favorites.service';
import { DriveNode } from '../../core/models';
import { FavoritesPage } from './favorites.page';

const session = (id: string, name: string): DriveNode => ({
  id, name, parentId: 'sleep', mimeType: 'audio/mpeg', isFolder: false,
});

describe('FavoritesPage', () => {
  let fixture: ComponentFixture<FavoritesPage>;

  beforeEach(async () => {
    await deleteDB(DB_NAME);
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([])] });
  });

  afterEach(async () => {
    (await TestBed.inject(DbService).db).close();
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(FavoritesPage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.items.hasValue()).toBe(true));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows an empty state', async () => {
    expect((await render()).textContent).toContain('No favorites yet');
  });

  it('lists favorites newest first and drops one when un-hearted', async () => {
    const favorites = TestBed.inject(FavoritesService);
    await favorites.add(session('a', '01 - Body Scan.mp3'));
    await new Promise((r) => setTimeout(r, 5));
    await favorites.add(session('b', 'Night Train.mp3'));

    const el = await render();
    const titles = () => [...el.querySelectorAll('.row__title')].map((t) => t.textContent);
    expect(titles()).toEqual(['Night Train', 'Body Scan']);
    expect(el.querySelectorAll('app-favorite-button .fav--on')).toHaveLength(2);

    (el.querySelector('app-favorite-button button') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(titles()).toEqual(['Body Scan']);
    });
  });
});
