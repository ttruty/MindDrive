import { TestBed } from '@angular/core/testing';
import { deleteDB } from 'idb';
import { DB_NAME, DbService } from './db.service';
import { DriveApiService } from './drive-api.service';
import { MediaSourceService } from './media-source.service';
import { DriveNode } from './models';

const node: DriveNode = {
  id: 's1',
  name: 'Body Scan.mp3',
  parentId: 'sleep',
  mimeType: 'audio/mpeg',
  isFolder: false,
  sizeBytes: 4,
};

describe('MediaSourceService', () => {
  let service: MediaSourceService;
  let api: { downloadMedia: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    await deleteDB(DB_NAME);
    api = {
      downloadMedia: vi.fn(async (_id: string, opts: { onProgress?: (f: number) => void }) => {
        opts.onProgress?.(1);
        return new Blob(['abcd'], { type: 'application/octet-stream' });
      }),
    };
    // jsdom Blobs (and ones cloned through fake-indexeddb) aren't accepted by Node's URL API.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    TestBed.configureTestingModule({ providers: [{ provide: DriveApiService, useValue: api }] });
    service = TestBed.inject(MediaSourceService);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    (await TestBed.inject(DbService).db).close();
  });

  it('streams from Drive, reporting progress and fixing the MIME type', async () => {
    const createUrl = vi.mocked(URL.createObjectURL);
    const onProgress = vi.fn();

    const media = await service.resolve(node, { onProgress });

    expect(media.source).toBe('stream');
    expect(api.downloadMedia).toHaveBeenCalledWith('s1', expect.objectContaining({ expectedBytes: 4 }));
    expect(onProgress).toHaveBeenCalledWith(1);
    expect((createUrl.mock.calls[0][0] as Blob).type).toBe('audio/mpeg');
  });

  it('reuses the last streamed file instead of downloading it again', async () => {
    await service.resolve(node);
    await service.resolve(node);
    expect(api.downloadMedia).toHaveBeenCalledTimes(1);
  });

  it('prefers a downloaded copy over the network', async () => {
    const db = await TestBed.inject(DbService).db;
    await db.put('mediaBlobs', {
      driveId: 's1',
      name: node.name,
      folderPath: 'Sleep',
      mimeType: 'audio/mpeg',
      blob: new Blob(['local'], { type: 'audio/mpeg' }),
      downloadedAt: new Date().toISOString(),
    });

    const media = await service.resolve(node);
    expect(media.source).toBe('download');
    expect(api.downloadMedia).not.toHaveBeenCalled();
  });
});
