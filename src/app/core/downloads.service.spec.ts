import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { DB_NAME, DbService } from './db.service';
import { DownloadsService } from './downloads.service';
import { DriveApiService } from './drive-api.service';
import { MediaSourceService } from './media-source.service';
import { DriveNode, FOLDER_MIME } from './models';

const folder = (id: string, name: string, parentId: string | null): DriveNode => ({
  id, name, parentId, mimeType: FOLDER_MIME, isFolder: true, sessionCount: 1,
});
const session = (id: string, parentId: string): DriveNode => ({
  id, name: `0${id} - Session ${id}.mp3`, parentId, mimeType: 'audio/mpeg', isFolder: false, sizeBytes: 4,
});

describe('DownloadsService', () => {
  let service: DownloadsService;
  let api: { downloadMedia: ReturnType<typeof vi.fn> };
  let streamed: Blob | null;

  beforeEach(async () => {
    await deleteDB(DB_NAME);
    streamed = null;
    api = { downloadMedia: vi.fn(async () => new Blob(['abcd'], { type: 'application/octet-stream' })) };
    TestBed.configureTestingModule({
      providers: [
        { provide: DriveApiService, useValue: api },
        { provide: MediaSourceService, useValue: { peekStreamed: () => streamed } },
      ],
    });
    const db = await TestBed.inject(DbService).db;
    for (const n of [folder('root', 'Root', null), folder('sleep', 'Sleep', 'root'), session('1', 'sleep'), session('2', 'sleep')]) {
      await db.put('driveCache', n);
    }
    service = TestBed.inject(DownloadsService);
  });

  afterEach(async () => {
    (await TestBed.inject(DbService).db).close();
  });

  /** Resolves once the queue has drained. */
  async function settle(): Promise<void> {
    await vi.waitFor(() => expect(service.active().size).toBe(0));
  }

  it('stores a session with its folder path and marks it downloaded', async () => {
    service.download(session('1', 'sleep'));
    expect(service.active().has('1')).toBe(true);
    await settle();

    expect(service.isDownloaded('1')).toBe(true);
    const [item] = await service.list();
    expect(item).toMatchObject({ driveId: '1', folderPath: 'Sleep', parentId: 'sleep', mimeType: 'audio/mpeg' });
    expect(api.downloadMedia).toHaveBeenCalledTimes(1);
  });

  it('reuses a just-streamed copy instead of downloading again', async () => {
    streamed = new Blob(['xyz'], { type: 'audio/mpeg' });
    service.download(session('1', 'sleep'));
    await settle();

    expect(api.downloadMedia).not.toHaveBeenCalled();
    expect(service.isDownloaded('1')).toBe(true);
  });

  it('downloadAll skips sessions already stored or queued', async () => {
    service.download(session('1', 'sleep'));
    await settle();

    expect(service.downloadAll([session('1', 'sleep'), session('2', 'sleep'), session('2', 'sleep')])).toBe(1);
    await settle();
    expect([...service.ids()].sort()).toEqual(['1', '2']);
  });

  it('reports failures but not cancellations', async () => {
    api.downloadMedia.mockRejectedValueOnce(new Error('Boom'));
    service.download(session('1', 'sleep'));
    await settle();
    expect(service.lastError()?.message).toContain('Boom');
    expect(service.isDownloaded('1')).toBe(false);

    const before = service.lastError();
    api.downloadMedia.mockImplementationOnce(
      (_id: string, opts: { signal: AbortSignal }) =>
        new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    service.download(session('2', 'sleep'));
    service.cancel('2');
    await settle();
    expect(service.lastError()).toBe(before);
    expect(service.isDownloaded('2')).toBe(false);
  });

  it('removes one or all downloads and reports storage', async () => {
    service.downloadAll([session('1', 'sleep'), session('2', 'sleep')]);
    await settle();
    expect((await service.storageInfo()).downloadsBytes).toBeGreaterThan(0);

    await service.remove('1');
    expect([...service.ids()]).toEqual(['2']);
    await service.removeAll();
    expect(service.ids().size).toBe(0);
    expect(await service.list()).toEqual([]);
  });
});
