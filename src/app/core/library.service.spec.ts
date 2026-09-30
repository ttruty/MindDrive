import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { DB_NAME, DbService } from './db.service';
import { DriveApiService } from './drive-api.service';
import { LibraryService } from './library.service';
import { DriveNode, FOLDER_MIME } from './models';

const ROOT_ID = 'root-folder-id-123';

function folder(id: string, name: string, parentId: string | null): DriveNode {
  return { id, name, parentId, mimeType: FOLDER_MIME, isFolder: true };
}
function file(id: string, name: string, parentId: string, mimeType: string): DriveNode {
  return { id, name, parentId, mimeType, isFolder: false };
}

// Root
// ├── Sleep/            ├── morning.mp3
// │   ├── Deep Rest/    └── notes.pdf   (ignored)
// │   │   └── rest.m4a
// │   └── wind-down.mp4
// └── Focus/ (empty)
const TREE: Record<string, DriveNode[]> = {
  [ROOT_ID]: [
    folder('sleep', 'Sleep', ROOT_ID),
    folder('focus', 'Focus', ROOT_ID),
    file('morning', 'morning.mp3', ROOT_ID, 'audio/mpeg'),
    file('notes', 'notes.pdf', ROOT_ID, 'application/pdf'),
  ],
  sleep: [
    folder('deep', 'Deep Rest', 'sleep'),
    file('wind', 'wind-down.mp4', 'sleep', 'video/mp4'),
  ],
  deep: [file('rest', 'rest.m4a', 'deep', 'audio/mp4')],
  focus: [],
};

class FakeDriveApi {
  getFile = vi.fn(async (id: string): Promise<DriveNode> => {
    if (id === ROOT_ID) return folder(ROOT_ID, 'Meditations', null);
    if (id === 'morning') return TREE[ROOT_ID][2];
    throw new Error('not found');
  });
  listChildren = vi.fn(async (id: string) => TREE[id] ?? []);
}

describe('LibraryService', () => {
  let service: LibraryService;
  let api: FakeDriveApi;

  beforeEach(async () => {
    localStorage.clear();
    await deleteDB(DB_NAME);
    api = new FakeDriveApi();
    TestBed.configureTestingModule({
      providers: [DbService, { provide: DriveApiService, useValue: api }],
    });
    service = TestBed.inject(LibraryService);
  });

  afterEach(async () => {
    (await TestBed.inject(DbService).db).close();
  });

  it('sets the root from a pasted link and caches folders + playable files only', async () => {
    const root = await service.setRootFromInput(
      `https://drive.google.com/drive/folders/${ROOT_ID}?usp=sharing`,
    );

    expect(root).toEqual({ id: ROOT_ID, name: 'Meditations' });
    expect(service.root()).toEqual(root);
    expect(service.syncError()).toBeNull();
    expect(service.lastSync()).toMatchObject({ folders: 3, sessions: 3 });

    // Focus has no sessions beneath it, so it's hidden.
    const top = await service.getChildren(ROOT_ID);
    expect(top.map((n) => n.name)).toEqual(['Sleep', 'morning.mp3']);
    expect(top[0].sessionCount).toBe(2);
    expect((await service.getNode(ROOT_ID))?.sessionCount).toBe(3);
    expect((await service.getNode('focus'))?.sessionCount).toBe(0);
    expect(await service.getNode('notes')).toBeUndefined();
    expect((await service.getChildren('deep')).map((n) => n.id)).toEqual(['rest']);
    expect(await service.getNode(ROOT_ID)).toMatchObject({ parentId: null, name: 'Meditations' });
  });

  it('builds a trail from below the root down to a node', async () => {
    await service.setRootFromInput(ROOT_ID);

    expect((await service.getTrail('rest')).map((n) => n.name)).toEqual([
      'Sleep',
      'Deep Rest',
      'rest.m4a',
    ]);
    expect(await service.getTrail(ROOT_ID)).toEqual([]);
    expect(await service.getTrail('missing')).toEqual([]);
  });

  it('treats a cache from an older format as stale', async () => {
    await service.setRootFromInput(ROOT_ID);
    api.listChildren.mockClear();
    expect(await service.syncIfStale()).toBe(false);
    expect(api.listChildren).not.toHaveBeenCalled();

    const old = { ...service.lastSync()!, format: 1 };
    localStorage.setItem('md.library.lastSync', JSON.stringify(old));
    (await TestBed.inject(DbService).db).close();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [DbService, { provide: DriveApiService, useValue: api }],
    });
    expect(await TestBed.inject(LibraryService).syncIfStale()).toBe(true);
  });

  it('keeps durations learned during playback across syncs for unchanged files', async () => {
    await service.setRootFromInput(ROOT_ID);
    const before = service.revision();
    await service.setDuration('rest', 420_000);
    expect(service.revision()).toBe(before + 1);
    expect((await service.getNode('rest'))?.durationMs).toBe(420_000);

    await service.sync();
    expect((await service.getNode('rest'))?.durationMs).toBe(420_000);
  });

  it('persists the root across service instances', async () => {
    await service.setRootFromInput(ROOT_ID);
    expect(JSON.parse(localStorage.getItem('md.library.root')!)).toEqual({
      id: ROOT_ID,
      name: 'Meditations',
    });
  });

  it('rejects input that is not a folder link, and files that are not folders', async () => {
    await expect(service.setRootFromInput('hello')).rejects.toThrow(/folder link/);
    await expect(service.setRoot('morning')).rejects.toThrow(/not a folder/);
    expect(service.root()).toBeNull();
  });

  it('reports sync failures without throwing and keeps the previous cache', async () => {
    await service.setRootFromInput(ROOT_ID);
    api.listChildren.mockRejectedValueOnce(new Error('offline'));

    expect(await service.sync()).toBe(false);
    expect(service.syncError()).toBe('offline');
    expect(service.progress()).toBeNull();
    expect(await service.getChildren(ROOT_ID)).toHaveLength(2);
  });

  it('clears the cache but keeps the root', async () => {
    await service.setRootFromInput(ROOT_ID);
    await service.clearCache();

    expect(await service.getChildren(ROOT_ID)).toEqual([]);
    expect(service.lastSync()).toBeNull();
    expect(service.root()?.id).toBe(ROOT_ID);
  });
});
