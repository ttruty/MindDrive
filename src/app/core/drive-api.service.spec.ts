import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { DriveApiService, NOT_PUBLIC_MESSAGE } from './drive-api.service';
import { AuthRequiredError, GoogleAuthService } from './google-auth.service';

describe('DriveApiService', () => {
  let api: DriveApiService;
  let fetchMock: ReturnType<typeof vi.fn>;
  const signedIn = signal(true);
  const originalKey = environment.googleApiKey;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const folder = { id: 'f1', name: 'Sleep', mimeType: 'application/vnd.google-apps.folder' };
  const call = (i: number) => {
    const [url, init] = fetchMock.mock.calls[i];
    return { url: new URL(String(url)), headers: init.headers as Record<string, string> };
  };

  function setup(apiKey: string): void {
    environment.googleApiKey = apiKey;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: GoogleAuthService,
          useValue: { isSignedIn: signedIn, getAccessToken: async () => 'tok', invalidateToken: vi.fn() },
        },
      ],
    });
    api = TestBed.inject(DriveApiService);
  }

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    signedIn.set(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    environment.googleApiKey = originalKey;
  });

  describe('signed in', () => {
    beforeEach(() => setup('pub-key'));

    it('sends the bearer token (not the API key) and bypasses the service worker', async () => {
      fetchMock.mockResolvedValueOnce(json(folder));
      expect(await api.getFile('f1')).toMatchObject({ id: 'f1', isFolder: true });

      const { url, headers } = call(0);
      expect(headers['Authorization']).toBe('Bearer tok');
      expect(url.searchParams.get('key')).toBeNull();
      expect(url.searchParams.get('ngsw-bypass')).toBe('true');
    });

    it('drops the bypass parameter for good if Drive rejects it', async () => {
      fetchMock
        .mockResolvedValueOnce(json({ error: { message: 'Invalid parameter: ngsw-bypass' } }, 400))
        .mockResolvedValueOnce(json(folder))
        .mockResolvedValueOnce(json(folder));

      await api.getFile('f1');
      await api.getFile('f1');

      expect(call(0).url.searchParams.has('ngsw-bypass')).toBe(true);
      expect(call(1).url.searchParams.has('ngsw-bypass')).toBe(false);
      expect(call(2).url.searchParams.has('ngsw-bypass')).toBe(false);
    });

    it('follows pagination when listing children, keeping resource keys', async () => {
      fetchMock
        .mockResolvedValueOnce(json({ files: [folder], nextPageToken: 'p2' }))
        .mockResolvedValueOnce(json({ files: [{ id: 'a', name: 'a.mp3', mimeType: 'audio/mpeg', size: '42', resourceKey: 'rk-a' }] }));

      const nodes = await api.listChildren('root');

      expect(nodes.map((n) => n.id)).toEqual(['f1', 'a']);
      expect(nodes[1]).toMatchObject({ parentId: 'root', sizeBytes: 42, isFolder: false, resourceKey: 'rk-a' });
      expect(call(1).url.searchParams.get('pageToken')).toBe('p2');
    });

    it('checks public access with the API key even while signed in', async () => {
      fetchMock.mockResolvedValueOnce(json(folder)).mockResolvedValueOnce(json({ error: { message: 'nope' } }, 404));

      expect(await api.isPublic('f1')).toBe(true);
      expect(call(0).headers['Authorization']).toBeUndefined();
      expect(call(0).url.searchParams.get('key')).toBe('pub-key');
      expect(await api.isPublic('private')).toBe(false);
    });
  });

  describe('signed out with an API key (shared links)', () => {
    beforeEach(() => {
      signedIn.set(false);
      setup('pub-key');
    });

    it('uses the API key and sends resource keys for link-shared items', async () => {
      fetchMock.mockResolvedValueOnce(new Response('abc', { headers: { 'Content-Type': 'audio/mpeg' } }));
      const blob = await api.downloadMedia('s1', { resourceKey: 'rk-1' });

      expect(blob.size).toBe(3);
      const { url, headers } = call(0);
      expect(url.searchParams.get('key')).toBe('pub-key');
      expect(url.searchParams.get('alt')).toBe('media');
      expect(headers['Authorization']).toBeUndefined();
      expect(headers['X-Goog-Drive-Resource-Keys']).toBe('s1/rk-1');
    });

    it('explains when a folder is not shared publicly', async () => {
      fetchMock.mockResolvedValueOnce(json({ error: { message: 'File not found: f1.' } }, 404));
      await expect(api.getFile('f1')).rejects.toThrow(NOT_PUBLIC_MESSAGE);
    });

    it('explains a bad API key instead of treating it as the bypass parameter', async () => {
      fetchMock.mockResolvedValue(json({ error: { message: 'API key not valid. Please pass a valid API key.' } }, 400));
      await expect(api.getFile('f1')).rejects.toThrow(/API key isn’t valid/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('requires sign-in when there is no API key', async () => {
    signedIn.set(false);
    setup('');
    expect(api.canRequest).toBe(false);
    await expect(api.getFile('f1')).rejects.toBeInstanceOf(AuthRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
