import { collectionProgress } from './collection-progress';
import { DriveNode } from './models';
import { SessionProgress } from './playback.service';

const s = (id: string): DriveNode => ({ id, name: id, parentId: 'c', mimeType: 'audio/mpeg', isFolder: false });
const sessions = ['a', 'b', 'c', 'd'].map(s);
const done = (id: string): [string, SessionProgress] => [id, { done: true, inProgress: false, positionSec: 0 }];

describe('collectionProgress', () => {
  it('counts done sessions and picks the first undone one as next', () => {
    const p = collectionProgress(sessions, new Map([done('a'), done('c')]));
    expect(p).toMatchObject({ total: 4, done: 2, fraction: 0.5, allDone: false });
    expect(p.next?.id).toBe('b');
  });

  it('a part-way replay of a finished session still counts as done', () => {
    const replaying: [string, SessionProgress] = ['a', { done: true, inProgress: true, positionSec: 40 }];
    expect(collectionProgress(sessions, new Map([replaying])).next?.id).toBe('b');
  });

  it('reports all done with no next, and handles empty collections', () => {
    const all = collectionProgress(sessions, new Map(sessions.map((x) => done(x.id))));
    expect(all).toMatchObject({ done: 4, allDone: true, next: null, fraction: 1 });
    expect(collectionProgress([], new Map())).toMatchObject({ total: 0, fraction: 0, allDone: false, next: null });
  });
});
