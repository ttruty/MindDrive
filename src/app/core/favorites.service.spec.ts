import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { DB_NAME, DbService } from './db.service';
import { FavoritesService } from './favorites.service';
import { DriveNode, FOLDER_MIME } from './models';

const folder = (id: string, name: string, parentId: string | null): DriveNode => ({
  id, name, parentId, mimeType: FOLDER_MIME, isFolder: true,
});
const session = (id: string, parentId: string): DriveNode => ({
  id, name: `01 - ${id}.mp3`, parentId, mimeType: 'audio/mpeg', isFolder: false, durationMs: 60_000,
});

describe('FavoritesService', () => {
  let service: FavoritesService;

  beforeEach(async () => {
    await deleteDB(DB_NAME);
    TestBed.configureTestingModule({});
    const db = await TestBed.inject(DbService).db;
    for (const n of [folder('root', 'Root', null), folder('sleep', 'Sleep', 'root'), session('a', 'sleep'), session('b', 'sleep')]) {
      await db.put('driveCache', n);
    }
    service = TestBed.inject(FavoritesService);
  });

  afterEach(async () => {
    (await TestBed.inject(DbService).db).close();
  });

  it('toggles favorites and lists them newest first with their folder path', async () => {
    expect(await service.toggle(session('a', 'sleep'))).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    await service.add(session('b', 'sleep'));

    expect([...service.ids()].sort()).toEqual(['a', 'b']);
    const list = await service.list();
    expect(list.map((f) => f.driveId)).toEqual(['b', 'a']);
    expect(list[0]).toMatchObject({ folderPath: 'Sleep', parentId: 'sleep', durationMs: 60_000 });

    expect(await service.toggle(session('a', 'sleep'))).toBe(false);
    expect(service.isFavorite('a')).toBe(false);
    expect((await service.list()).map((f) => f.driveId)).toEqual(['b']);
  });

  it('ignores folders', async () => {
    await service.add(folder('sleep', 'Sleep', 'root'));
    expect(service.ids().size).toBe(0);
  });

  it('still lists favorites the library cache no longer knows about', async () => {
    await service.add(session('a', 'sleep'));
    await (await TestBed.inject(DbService).db).clear('driveCache');

    const [item] = await service.listAsNodes();
    expect(item.node).toMatchObject({ id: 'a', name: '01 - a.mp3', isFolder: false, durationMs: 60_000 });
    expect(item.folderPath).toBe('Sleep');
  });

  it('loads existing favorites on startup', async () => {
    await service.add(session('a', 'sleep'));
    (await TestBed.inject(DbService).db).close();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.inject(FavoritesService);
    await vi.waitFor(() => expect(fresh.isFavorite('a')).toBe(true));
  });
});
