import { Component, DestroyRef, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { leafOutline, play } from 'ionicons/icons';
import { LibraryService } from '../../core/library.service';
import { DriveNode, PlaybackEntry } from '../../core/models';
import { PlaybackService } from '../../core/playback.service';
import { buildHeatmap, computeStreaks, localDateKey } from '../../core/streak';
import { StreakService } from '../../core/streak.service';
import { PlayerLauncher } from '../../player/player-launcher.service';
import { CategoryCardComponent } from '../../shared/category-card/category-card.component';
import { displayName, formatDuration } from '../../shared/display';
import { LoadErrorComponent } from '../../shared/load-error/load-error.component';
import { StreakCardComponent } from './streak-card/streak-card.component';

/** How many quick-pick categories Home shows. */
const QUICK_PICKS = 4;

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonIcon,
    IonSpinner,
    StreakCardComponent,
    CategoryCardComponent,
    LoadErrorComponent,
  ],
})
export class HomePage {
  readonly library = inject(LibraryService);
  private readonly playback = inject(PlaybackService);
  private readonly streak = inject(StreakService);
  private readonly player = inject(PlayerLauncher);

  /** "Now", refreshed when the page or app comes back into view so the day rolls over. */
  private readonly now = signal(new Date());

  readonly greeting = computed(() => {
    const h = this.now().getHours();
    return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening';
  });

  readonly data = resource({
    params: () => ({
      day: localDateKey(this.now()),
      streak: this.streak.revision(),
      playback: this.playback.revision(),
      library: this.library.revision(),
      root: this.library.root()?.id,
    }),
    loader: async ({ params }) => {
      const today = this.now();
      const [entries, recent] = await Promise.all([this.streak.entries(), this.playback.recent(20)]);
      return {
        streaks: computeStreaks(entries.map((e) => e.date), today),
        weeks: buildHeatmap(entries, today),
        hasHistory: entries.length > 0,
        resume: recent.find((e) => !e.completed && e.positionSec > 0) ?? null,
        picks: params.root ? await this.quickPicks(params.root, recent) : [],
      };
    },
  });

  constructor() {
    addIcons({ leafOutline, play });
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.now.set(new Date());
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', onVisible));
  }

  ionViewWillEnter(): void {
    this.now.set(new Date());
  }

  resumeTitle(entry: PlaybackEntry): string {
    return displayName({ name: entry.name, isFolder: false });
  }

  resumeProgress(entry: PlaybackEntry): number {
    return entry.durationSec ? Math.min(entry.positionSec / entry.durationSec, 1) : 0;
  }

  resumeMeta(entry: PlaybackEntry): string {
    const left = entry.durationSec ? entry.durationSec - entry.positionSec : 0;
    const remaining = left > 0 ? `${formatDuration(left * 1000)} left` : '';
    return [entry.folderPath, remaining].filter(Boolean).join(' · ');
  }

  async resume(entry: PlaybackEntry): Promise<void> {
    const node: DriveNode = (await this.library.getNode(entry.driveId)) ?? {
      id: entry.driveId,
      name: entry.name,
      parentId: entry.parentId,
      mimeType: entry.mimeType,
      isFolder: false,
    };
    await this.player.open(node, entry.folderPath);
  }

  /**
   * Top-level categories, most recently played first; the rest keep library order.
   * "Played" = any session anywhere beneath the category.
   */
  private async quickPicks(rootId: string, recent: PlaybackEntry[]): Promise<DriveNode[]> {
    const categories = (await this.library.getChildren(rootId)).filter((n) => n.isFolder);
    const rank = new Map<string, number>();
    for (const [i, entry] of recent.entries()) {
      const top = (await this.library.getTrail(entry.driveId))[0];
      if (top?.isFolder && !rank.has(top.id)) rank.set(top.id, i);
    }
    return categories
      .map((node, order) => ({ node, key: rank.get(node.id) ?? recent.length + order }))
      .sort((a, b) => a.key - b.key)
      .slice(0, QUICK_PICKS)
      .map((c) => c.node);
  }
}
