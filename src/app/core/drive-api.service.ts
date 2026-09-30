import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthRequiredError, GoogleAuthService } from './google-auth.service';
import { DriveNode, FOLDER_MIME } from './models';

const API = 'https://www.googleapis.com/drive/v3';
const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,resourceKey,videoMediaMetadata(durationMillis)';
const MAX_RETRIES = 3;

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  resourceKey?: string;
  videoMediaMetadata?: { durationMillis?: string };
}

interface FileList {
  files: DriveFile[];
  nextPageToken?: string;
}

/**
 * How a request authenticates:
 * - 'auto': the signed-in account's token if there is one, otherwise the API key (public items only).
 * - 'public': always the API key — used to check whether something is shared "Anyone with the link".
 */
export type Credentials = 'auto' | 'public';

export interface RequestOptions {
  /** Resource key for items shared by link before Google's 2021 security update. */
  resourceKey?: string;
  credentials?: Credentials;
}

export class DriveApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DriveApiError';
  }
}

export const NOT_PUBLIC_MESSAGE =
  'This folder isn’t shared publicly. In Google Drive, set sharing to “Anyone with the link”, or connect your Google account.';

/**
 * Thin wrapper over the Drive v3 REST endpoints MindDrive needs. Signed in, it uses the account's
 * OAuth token. Signed out, it falls back to an API key, which can read anything shared as
 * "Anyone with the link" — no sign-in needed.
 */
@Injectable({ providedIn: 'root' })
export class DriveApiService {
  private readonly auth = inject(GoogleAuthService);
  private readonly apiKey = environment.googleApiKey;

  /**
   * Ask the Angular service worker not to proxy Drive traffic (large media bodies gain nothing from
   * passing through it). The `ngsw-bypass` *header* fails Google's CORS preflight, so it goes in the
   * query string; if Drive ever rejects that parameter we drop it for the rest of the session.
   */
  private swBypass = true;

  /** Whether public links can be used without signing in. */
  get hasApiKey(): boolean {
    return !!this.apiKey;
  }

  /** Whether a request right now could reach Drive at all (signed in, or public access available). */
  get canRequest(): boolean {
    return this.auth.isSignedIn() || this.hasApiKey;
  }

  /** Metadata for a single file or folder (parentId is left null — callers know the context). */
  async getFile(id: string, opts: RequestOptions = {}): Promise<DriveNode> {
    const file = await this.get<DriveFile>(
      `files/${encodeURIComponent(id)}`,
      { fields: FILE_FIELDS, supportsAllDrives: 'true' },
      { ...opts, resourceId: id },
    );
    return toDriveNode(file, null);
  }

  /** Whether an item is readable without an account (shared "Anyone with the link"). */
  async isPublic(id: string, resourceKey?: string): Promise<boolean> {
    if (!this.hasApiKey) return false;
    try {
      await this.getFile(id, { resourceKey, credentials: 'public' });
      return true;
    } catch (err) {
      if (err instanceof DriveApiError && [403, 404].includes(err.status)) return false;
      throw err;
    }
  }

  /** All non-trashed children of a folder, following pagination. */
  async listChildren(
    parentId: string,
    opts: RequestOptions & { foldersOnly?: boolean } = {},
  ): Promise<DriveNode[]> {
    const clauses = [`'${parentId.replace(/['\\]/g, '\\$&')}' in parents`, 'trashed = false'];
    if (opts.foldersOnly) clauses.push(`mimeType = '${FOLDER_MIME}'`);

    const nodes: DriveNode[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.get<FileList>(
        'files',
        {
          q: clauses.join(' and '),
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          orderBy: 'folder,name_natural',
          pageSize: '1000',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
          ...(pageToken ? { pageToken } : {}),
        },
        { ...opts, resourceId: parentId },
      );
      nodes.push(...page.files.map((f) => toDriveNode(f, parentId)));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return nodes;
  }

  /**
   * Download a file's content (`alt=media`) as a Blob. Reports progress as a 0–1 fraction when the
   * total size is known (Content-Length, else `expectedBytes`). Abort via `signal`.
   */
  async downloadMedia(
    id: string,
    opts: RequestOptions & {
      signal?: AbortSignal;
      expectedBytes?: number;
      onProgress?: (fraction: number) => void;
    } = {},
  ): Promise<Blob> {
    const res = await this.request(
      `files/${encodeURIComponent(id)}`,
      { alt: 'media', supportsAllDrives: 'true' },
      { ...opts, resourceId: id },
    );
    const type = res.headers.get('Content-Type') ?? 'application/octet-stream';
    const total = Number(res.headers.get('Content-Length')) || opts.expectedBytes || 0;
    if (!res.body || !opts.onProgress || !total) return res.blob();

    const reader = res.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      opts.onProgress(Math.min(received / total, 1));
    }
    return new Blob(chunks, { type });
  }

  private async get<T>(
    path: string,
    params: Record<string, string>,
    opts: RequestOptions & { resourceId: string },
  ): Promise<T> {
    const res = await this.request(path, params, opts);
    return (await res.json()) as T;
  }

  /** GET with one retry on 401 (fresh token) and backoff on rate limits / 5xx. */
  private async request(
    path: string,
    baseParams: Record<string, string>,
    opts: RequestOptions & { resourceId: string; signal?: AbortSignal },
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const useToken = opts.credentials !== 'public' && this.auth.isSignedIn();
      if (!useToken && !this.hasApiKey) throw new AuthRequiredError();

      const withBypass = this.swBypass;
      const params: Record<string, string> = { ...baseParams };
      if (!useToken) params['key'] = this.apiKey;
      if (withBypass) params['ngsw-bypass'] = 'true';

      const headers: Record<string, string> = {};
      if (useToken) headers['Authorization'] = `Bearer ${await this.auth.getAccessToken()}`;
      if (opts.resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${opts.resourceId}/${opts.resourceKey}`;

      const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, {
        headers,
        signal: opts.signal,
      });
      if (res.ok) return res;
      if (res.status === 400 && withBypass && (await mentionsBypass(res.clone()))) {
        this.swBypass = false;
        attempt--; // not a real attempt — just retry without the parameter
        continue;
      }

      const retryable =
        (res.status === 401 && useToken && attempt === 0) ||
        ((res.status === 429 || res.status === 403 || res.status >= 500) &&
          attempt < MAX_RETRIES &&
          (res.status !== 403 || (await isRateLimited(res.clone()))));
      if (!retryable) throw new DriveApiError(await describeError(res, useToken), res.status);

      if (res.status === 401) {
        this.auth.invalidateToken();
      } else {
        await delay(2 ** attempt * 500 + Math.random() * 250);
      }
    }
  }
}

function toDriveNode(file: DriveFile, parentId: string | null): DriveNode {
  return {
    id: file.id,
    name: file.name,
    parentId,
    mimeType: file.mimeType,
    isFolder: file.mimeType === FOLDER_MIME,
    ...(file.size ? { sizeBytes: Number(file.size) } : {}),
    ...(file.modifiedTime ? { modifiedTime: file.modifiedTime } : {}),
    ...(file.resourceKey ? { resourceKey: file.resourceKey } : {}),
    ...(file.videoMediaMetadata?.durationMillis
      ? { durationMs: Number(file.videoMediaMetadata.durationMillis) }
      : {}),
  };
}

async function errorBody(res: Response): Promise<{ message?: string; reasons: string[] }> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    };
    return {
      message: body.error?.message,
      reasons: (body.error?.errors ?? []).map((e) => e.reason ?? ''),
    };
  } catch {
    return { reasons: [] };
  }
}

async function isRateLimited(res: Response): Promise<boolean> {
  return (await errorBody(res)).reasons.some((r) => /rateLimitExceeded/i.test(r));
}

/** Only a 400 that's actually about our extra query parameter should turn the bypass off. */
async function mentionsBypass(res: Response): Promise<boolean> {
  const { message } = await errorBody(res);
  return /ngsw-bypass|unknown parameter|invalid parameter/i.test(message ?? '');
}

async function describeError(res: Response, usedToken: boolean): Promise<string> {
  const { message } = await errorBody(res);
  if (!usedToken) {
    if (res.status === 400 && /API key/i.test(message ?? '')) {
      return 'MindDrive’s Google API key isn’t valid. Check googleApiKey in the environment config.';
    }
    // Without an account, "not shared publicly" shows up as 403 (no permission) or 404 (hidden).
    if (res.status === 403 || res.status === 404) return NOT_PUBLIC_MESSAGE;
  }
  if (res.status === 404) return "That couldn't be found in Google Drive, or you don't have access to it.";
  return message ?? `Google Drive request failed (${res.status}).`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
