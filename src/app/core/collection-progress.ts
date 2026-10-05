import { DriveNode } from './models';
import { SessionProgress } from './playback.service';

export interface CollectionProgress {
  total: number;
  done: number;
  /** done / total, 0 when empty. */
  fraction: number;
  /** The next session to play: the first not yet done, in browse order. Null when all are done. */
  next: DriveNode | null;
  allDone: boolean;
}

/** How far through a category (and everything beneath it) the listener is. */
export function collectionProgress(
  sessions: DriveNode[],
  progress: ReadonlyMap<string, SessionProgress>,
): CollectionProgress {
  const done = sessions.filter((s) => progress.get(s.id)?.done).length;
  const next = sessions.find((s) => !progress.get(s.id)?.done) ?? null;
  return {
    total: sessions.length,
    done,
    fraction: sessions.length ? done / sessions.length : 0,
    next,
    allDone: sessions.length > 0 && done === sessions.length,
  };
}
