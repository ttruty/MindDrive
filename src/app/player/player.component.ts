import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonProgressBar,
  IonRange,
  ModalController,
  RangeCustomEvent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  bandage,
  bulb,
  chevronDown,
  cloud,
  expand,
  flower,
  happy,
  heart,
  infinite,
  leaf,
  moon,
  musicalNotes,
  pause,
  planet,
  play,
  rainy,
  school,
  sparkles,
  star,
  sunny,
  walk,
  water,
} from 'ionicons/icons';
import { AuthRequiredError } from '../core/google-auth.service';
import { LibraryService } from '../core/library.service';
import { MediaSourceService, ResolvedMedia } from '../core/media-source.service';
import { DriveNode } from '../core/models';
import { PlaybackService } from '../core/playback.service';
import { StreakService } from '../core/streak.service';
import { CategoryAppearance, displayName, formatClock } from '../shared/display';
import { DownloadButtonComponent } from '../shared/download-button/download-button.component';
import { FavoriteButtonComponent } from '../shared/favorite-button/favorite-button.component';

/** Seconds jumped by the skip buttons and lock-screen seek actions. */
const SKIP_SEC = 15;
/** How often the resume position is written while playing. */
const SAVE_EVERY_MS = 5_000;

type Status = 'loading' | 'ready' | 'error';

/** Full-screen player modal. Opened via PlayerLauncher; inputs arrive as componentProps. */
@Component({
  selector: 'app-player',
  templateUrl: 'player.component.html',
  styleUrls: ['player.component.scss'],
  imports: [
    IonContent,
    IonButton,
    IonIcon,
    IonRange,
    IonProgressBar,
    DownloadButtonComponent,
    FavoriteButtonComponent,
  ],
})
export class PlayerComponent implements OnInit, OnDestroy {
  readonly node = input.required<DriveNode>();
  /** "Sleep / Deep Rest" — empty for sessions at the library root. */
  readonly folderPath = input('');
  readonly appearance = input.required<CategoryAppearance>();

  private readonly modalCtrl = inject(ModalController);
  private readonly mediaSource = inject(MediaSourceService);
  private readonly playback = inject(PlaybackService);
  private readonly library = inject(LibraryService);
  private readonly streak = inject(StreakService);

  private readonly mediaRef = viewChild<ElementRef<HTMLMediaElement>>('media');

  readonly title = computed(() => displayName(this.node()));
  readonly isVideo = computed(() => this.node().mimeType.startsWith('video/'));

  readonly status = signal<Status>('loading');
  readonly loadProgress = signal<number | null>(null);
  readonly error = signal<string | null>(null);
  readonly src = signal<string | null>(null);
  readonly playing = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  /** Set when playback picked up from a saved position, until the listener dismisses it. */
  readonly resumedFrom = signal<number | null>(null);

  readonly elapsedLabel = computed(() => formatClock(this.currentTime()));
  readonly remainingLabel = computed(() => `-${formatClock(this.duration() - this.currentTime())}`);
  readonly skipSec = SKIP_SEC;
  protected readonly formatClock = formatClock;

  private resolved?: ResolvedMedia;
  private abort?: AbortController;
  private startAt = 0;
  private metadataLoaded = false;
  private scrubbing = false;
  private lastSavedAt = 0;
  private destroyed = false;
  /** A session counts once toward the streak, however often it's paused and resumed. */
  private streakRecorded = false;

  constructor() {
    addIcons({
      alertCircleOutline, chevronDown, expand, pause, play,
      // category icons (see categoryAppearance)
      bandage, bulb, cloud, flower, happy, heart, infinite, leaf, moon,
      musicalNotes, planet, rainy, school, sparkles, star, sunny, walk, water,
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.abort?.abort();
    const el = this.el;
    if (el && this.metadataLoaded) {
      el.pause();
      void this.save();
    }
    this.resolved?.release();
    clearMediaSession();
  }

  async load(): Promise<void> {
    this.abort?.abort();
    const abort = (this.abort = new AbortController());
    this.status.set('loading');
    this.error.set(null);
    this.loadProgress.set(null);

    try {
      const [resolved, startAt] = await Promise.all([
        this.mediaSource.resolve(this.node(), {
          signal: abort.signal,
          onProgress: (f) => this.loadProgress.set(f),
        }),
        this.playback.resumePosition(this.node().id),
      ]);
      if (this.destroyed) {
        resolved.release();
        return;
      }
      this.resolved?.release();
      this.resolved = resolved;
      this.startAt = startAt;
      this.metadataLoaded = false;
      this.src.set(resolved.url);
      this.status.set('ready');
    } catch (err) {
      if (abort.signal.aborted) return;
      this.error.set(describeLoadError(err));
      this.status.set('error');
    }
  }

  close(): void {
    void this.modalCtrl.dismiss();
  }

  toggle(): void {
    const el = this.el;
    if (!el) return;
    if (el.paused) void el.play().catch(() => this.playing.set(false));
    else el.pause();
  }

  skip(deltaSec: number): void {
    const el = this.el;
    if (el) this.seekTo(el.currentTime + deltaSec);
  }

  startOver(): void {
    this.seekTo(0);
    this.resumedFrom.set(null);
  }

  // ---- scrubber ----------------------------------------------------------

  onScrubStart(): void {
    this.scrubbing = true;
  }

  onScrubMove(event: Event): void {
    this.currentTime.set(Number((event as RangeCustomEvent).detail.value));
  }

  onScrubEnd(event: Event): void {
    this.scrubbing = false;
    this.seekTo(Number((event as RangeCustomEvent).detail.value));
  }

  // ---- media element events ---------------------------------------------

  onLoadedMetadata(): void {
    const el = this.el;
    if (!el) return;
    this.metadataLoaded = true;
    const duration = Number.isFinite(el.duration) ? el.duration : 0;
    this.duration.set(duration);
    if (duration && !this.node().durationMs) {
      void this.library.setDuration(this.node().id, Math.round(duration * 1000));
    }
    if (this.startAt > 0 && (!duration || this.startAt < duration)) {
      el.currentTime = this.startAt;
      this.resumedFrom.set(this.startAt);
    }
    this.currentTime.set(el.currentTime);
    this.setupMediaSession();
    // The tap that opened the player may no longer count as a user gesture after the fetch;
    // if autoplay is refused the big play button is right there.
    void el.play().catch(() => this.playing.set(false));
  }

  /** Some files (e.g. recorded WebM) only learn their real length after metadata loads. */
  onDurationChange(): void {
    const el = this.el;
    if (el && this.metadataLoaded && Number.isFinite(el.duration)) {
      this.duration.set(el.duration);
      updatePositionState(el);
    }
  }

  onTimeUpdate(): void {
    const el = this.el;
    if (!el) return;
    if (!this.scrubbing) this.currentTime.set(el.currentTime);
    if (!el.paused && Date.now() - this.lastSavedAt >= SAVE_EVERY_MS) void this.save();
  }

  onPlay(): void {
    this.playing.set(true);
    setPlaybackState('playing');
    if (!this.streakRecorded) {
      this.streakRecorded = true;
      void this.streak.recordSessionStart();
    }
  }

  onPause(): void {
    this.playing.set(false);
    setPlaybackState('paused');
    if (this.metadataLoaded) void this.save();
  }

  onEnded(): void {
    this.playing.set(false);
    this.resumedFrom.set(null);
    setPlaybackState('paused');
    void this.save(true);
  }

  enterFullscreen(): void {
    const el = this.el as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | undefined;
    if (!el) return;
    if (el.requestFullscreen) void el.requestFullscreen().catch(() => el.webkitEnterFullscreen?.());
    else el.webkitEnterFullscreen?.();
  }

  // ---- internals ---------------------------------------------------------

  private get el(): HTMLMediaElement | undefined {
    return this.mediaRef()?.nativeElement;
  }

  private seekTo(sec: number): void {
    const el = this.el;
    if (!el) return;
    const max = this.duration() || el.duration || 0;
    el.currentTime = Math.min(Math.max(sec, 0), max);
    this.currentTime.set(el.currentTime);
    updatePositionState(el);
    void this.save();
  }

  private async save(completed?: boolean): Promise<void> {
    const el = this.el;
    if (!el || !this.metadataLoaded) return;
    this.lastSavedAt = Date.now();
    const node = this.node();
    await this.playback.save({
      driveId: node.id,
      name: node.name,
      mimeType: node.mimeType,
      parentId: node.parentId,
      folderPath: this.folderPath(),
      positionSec: el.currentTime,
      ...(this.duration() ? { durationSec: this.duration() } : {}),
      ...(completed ? { completed } : {}),
    });
  }

  /** Lock-screen / headset controls. */
  private setupMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: this.title(),
      artist: this.folderPath() || 'MindDrive',
      album: 'MindDrive',
      artwork: [{ src: 'icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }],
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => this.toggle()],
      ['pause', () => this.toggle()],
      ['seekbackward', (d) => this.skip(-(d.seekOffset ?? SKIP_SEC))],
      ['seekforward', (d) => this.skip(d.seekOffset ?? SKIP_SEC)],
      ['seekto', (d) => d.seekTime !== undefined && this.seekTo(d.seekTime)],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Action not supported by this browser.
      }
    }
    if (this.el) updatePositionState(this.el);
  }
}

function describeLoadError(err: unknown): string {
  if (err instanceof AuthRequiredError) return 'Reconnect Google Drive in Settings to play this session.';
  // fetch() rejects with a TypeError when there's no network.
  if (!navigator.onLine || err instanceof TypeError) {
    return "You're offline. Download sessions ahead of time to listen without a connection.";
  }
  return err instanceof Error ? err.message : String(err);
}

function setPlaybackState(state: MediaSessionPlaybackState): void {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state;
}

function updatePositionState(el: HTMLMediaElement): void {
  if (!('mediaSession' in navigator) || !Number.isFinite(el.duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: el.duration,
      position: Math.min(el.currentTime, el.duration),
      playbackRate: el.playbackRate,
    });
  } catch {
    // Older browsers.
  }
}

function clearMediaSession(): void {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  ms.metadata = null;
  ms.playbackState = 'none';
  for (const action of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto'] as const) {
    try {
      ms.setActionHandler(action, null);
    } catch {
      // ignore
    }
  }
}
