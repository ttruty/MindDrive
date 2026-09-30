import { TestBed } from '@angular/core/testing';
import { DriveApiService } from './drive-api.service';
import { GoogleAuthService } from './google-auth.service';

describe('DriveApiService', () => {
  let api: DriveApiService;
  let fetchMock: ReturnType<typeof vi.fn>;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const folder = { id: 'f1', name: 'Sleep', mimeType: 'application/vnd.google-apps.folder' };

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: GoogleAuthService,
          useValue: { getAccessToken: async () => 'tok', invalidateToken: vi.fn() },
        },
      ],
    });
    api = TestBed.inject(DriveApiService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends the bearer token and asks the service worker to stay out of the way', async () => {
    fetchMock.mockResolvedValueOnce(json(folder));
    const node = await api.getFile('f1');

    expect(node).toMatchObject({ id: 'f1', isFolder: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('ngsw-bypass=true');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('drops the bypass parameter for good if Drive rejects it', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: { message: 'Invalid parameter' } }, 400))
      .mockResolvedValueOnce(json(folder))
      .mockResolvedValueOnce(json(folder));

    await api.getFile('f1');
    await api.getFile('f1');

    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls[0]).toContain('ngsw-bypass');
    expect(urls[1]).not.toContain('ngsw-bypass');
    expect(urls[2]).not.toContain('ngsw-bypass');
  });

  it('follows pagination when listing children', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ files: [folder], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(json({ files: [{ id: 'a', name: 'a.mp3', mimeType: 'audio/mpeg', size: '42' }] }));

    const nodes = await api.listChildren('root');

    expect(nodes.map((n) => n.id)).toEqual(['f1', 'a']);
    expect(nodes[1]).toMatchObject({ parentId: 'root', sizeBytes: 42, isFolder: false });
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=p2');
  });
});
