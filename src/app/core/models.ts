export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** driveCache store — mirrors the Drive folder tree under the configured root. */
export interface DriveNode {
  id: string;
  name: string;
  /** null only for the configured root folder itself. */
  parentId: string | null;
  mimeType: string;
  isFolder: boolean;
  sizeBytes?: number;
  modifiedTime?: string;
  /** Known for video (Drive videoMediaMetadata); audio durations are unknown until played. */
  durationMs?: number;
  /** Folders only: number of playable files anywhere beneath this folder (set during sync). */
  sessionCount?: number;
}

/** mediaBlobs store — downloaded content (written in Phase 4). */
export interface DownloadedMedia {
  driveId: string;
  name: string;
  folderPath: string;
  mimeType: string;
  blob: Blob;
  downloadedAt: string;
  lastPositionSec?: number;
}

/** streakLog store — one entry per local calendar day with any playback (Phase 5). */
export interface StreakEntry {
  date: string;
  sessionsPlayed: number;
}

export function isFolderMime(mimeType: string): boolean {
  return mimeType === FOLDER_MIME;
}

export function isPlayableMime(mimeType: string): boolean {
  return mimeType.startsWith('audio/') || mimeType.startsWith('video/');
}
