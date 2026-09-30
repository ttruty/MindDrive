import { Injectable, inject } from '@angular/core';
import { GoogleAuthService } from './google-auth.service';
import { DriveNode, FOLDER_MIME } from './models';

const API = 'https://www.googleapis.com/drive/v3';
const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,videoMediaMetadata(durationMillis)';
const MAX_RETRIES = 3;

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  videoMediaMetadata?: { durationMillis?: string };
}

interface FileList {
  files: DriveFile[];
  nextPageToken?: string;
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

/** Thin, authenticated wrapper over the Drive v3 REST endpoints MindDrive needs. */
@Injectable({ providedIn: 'root' })
export class DriveApiService {
  private readonly auth = inject(GoogleAuthService);

  /** Metadata for a single file or folder (parentId is left null — callers know the context). */
  async getFile(id: string): Promise<DriveNode> {
    const file = await this.get<DriveFile>(`files/${encodeURIComponent(id)}`, {
      fields: FILE_FIELDS,
      supportsAllDrives: 'true',
    });
    return toDriveNode(file, null);
  }

  /** All non-trashed children of a folder, following pagination. */
  async listChildren(parentId: string, opts: { foldersOnly?: boolean } = {}): Promise<DriveNode[]> {
    const clauses = [`'${parentId.replace(/['\\]/g, '\\$&')}' in parents`, 'trashed = false'];
    if (opts.foldersOnly) clauses.push(`mimeType = '${FOLDER_MIME}'`);

    const nodes: DriveNode[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.get<FileList>('files', {
        q: clauses.join(' and '),
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        orderBy: 'folder,name_natural',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        ...(pageToken ? { pageToken } : {}),
      });
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
    opts: { signal?: AbortSignal; expectedBytes?: number; onProgress?: (fraction: number) => void } = {},
  ): Promise<Blob> {
    const res = await this.request(`files/${encodeURIComponent(id)}`, {
      params: { alt: 'media', supportsAllDrives: 'true' },
      signal: opts.signal,
    });
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

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const res = await this.request(path, { params });
    return (await res.json()) as T;
  }

  /** Authorized GET with one retry on 401 (fresh token) and backoff on rate limits / 5xx. */
  private async request(
    path: string,
    opts: { params: Record<string, string>; signal?: AbortSignal },
  ): Promise<Response> {
    const url = `${API}/${path}?${new URLSearchParams(opts.params)}`;

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${await this.auth.getAccessToken()}` },
        signal: opts.signal,
      });
      if (res.ok) return res;

      const retryable =
        (res.status === 401 && attempt === 0) ||
        ((res.status === 429 || res.status === 403 || res.status >= 500) &&
          attempt < MAX_RETRIES &&
          (res.status !== 403 || (await isRateLimited(res.clone()))));
      if (!retryable) throw new DriveApiError(await describeError(res), res.status);

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
    ...(file.videoMediaMetadata?.durationMillis
      ? { durationMs: Number(file.videoMediaMetadata.durationMillis) }
      : {}),
  };
}

async function isRateLimited(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as { error?: { errors?: { reason?: string }[] } };
    return !!body.error?.errors?.some((e) => /rateLimitExceeded/i.test(e.reason ?? ''));
  } catch {
    return false;
  }
}

async function describeError(res: Response): Promise<string> {
  if (res.status === 404) return "That folder couldn't be found, or you don't have access to it.";
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // fall through
  }
  return `Google Drive request failed (${res.status}).`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
