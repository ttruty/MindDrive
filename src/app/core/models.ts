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

/**
 * playback store — resume position + "recently played" for every session, streamed or downloaded.
 * This (not DownloadedMedia.lastPositionSec) is the source of truth for resume.
 */
export interface PlaybackEntry {
  driveId: string;
  name: string;
  mimeType: string;
  /** Folder the session lives in, so "Continue listening" can link back to it. */
  parentId: string | null;
  /** Human-readable breadcrumb, e.g. "Sleep / Deep Rest". */
  folderPath: string;
  positionSec: number;
  durationSec?: number;
  /** True once the session played to the end; the next play starts over. */
  completed: boolean;
  /** ISO timestamp of the last position write. */
  updatedAt: string;
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
