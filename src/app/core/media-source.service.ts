import { Injectable, inject } from '@angular/core';
import { DbService } from './db.service';
import { DriveApiService } from './drive-api.service';
import { DriveNode } from './models';

export interface ResolvedMedia {
  /** Object URL to use as the media element's src. */
  url: string;
  /** Where the bytes came from. */
  source: 'download' | 'stream';
  /** Revoke the object URL. Call when the player closes. */
  release(): void;
}

/**
 * Turns a session into something a <audio>/<video> element can play. Drive's alt=media endpoint
 * needs an Authorization header, so streamed content is fetched as a Blob and played from an
 * object URL. A downloaded copy in mediaBlobs always wins over the network.
 */
@Injectable({ providedIn: 'root' })
export class MediaSourceService {
  private readonly db = inject(DbService);
  private readonly api = inject(DriveApiService);

  /** The most recently streamed file, so closing and reopening the same session is instant. */
  private lastStreamed: { id: string; blob: Blob } | null = null;

  async resolve(
    node: DriveNode,
    opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
  ): Promise<ResolvedMedia> {
    const local = await (await this.db.db).get('mediaBlobs', node.id);
    if (local) return toResolved(local.blob, 'download');

    if (this.lastStreamed?.id !== node.id) {
      const blob = await this.api.downloadMedia(node.id, {
        signal: opts.signal,
        expectedBytes: node.sizeBytes,
        onProgress: opts.onProgress,
      });
      this.lastStreamed = { id: node.id, blob: withMimeType(blob, node.mimeType) };
    }
    return toResolved(this.lastStreamed.blob, 'stream');
  }
}

function toResolved(blob: Blob, source: ResolvedMedia['source']): ResolvedMedia {
  const url = URL.createObjectURL(blob);
  return { url, source, release: () => URL.revokeObjectURL(url) };
}

/** Drive sometimes serves a generic Content-Type; media elements need the real one. */
function withMimeType(blob: Blob, mimeType: string): Blob {
  return blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
}
