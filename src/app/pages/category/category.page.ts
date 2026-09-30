import { Component, computed, inject, input, resource } from '@angular/core';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
  NavController,
  RefresherCustomEvent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  checkmarkCircle,
  chevronForward,
  cloudDownloadOutline,
  cloudOfflineOutline,
  searchOutline,
} from 'ionicons/icons';
import { DownloadsService } from '../../core/downloads.service';
import { GoogleAuthService } from '../../core/google-auth.service';
import { LibraryService } from '../../core/library.service';
import { DriveNode } from '../../core/models';
import { PlayerLauncher } from '../../player/player-launcher.service';
import { CategoryCardComponent } from '../../shared/category-card/category-card.component';
import {
  categoryAppearance,
  displayName,
  formatBytes,
  sessionCountLabel,
} from '../../shared/display';
import { SessionListComponent } from '../../shared/session-list/session-list.component';

interface Crumb {
  label: string;
  url: string;
}

/** One category (Drive folder): its subcategories and sessions, with a breadcrumb trail. */
@Component({
  selector: 'app-category',
  templateUrl: 'category.page.html',
  styleUrls: ['category.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonContent,
    IonIcon,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
    CategoryCardComponent,
    SessionListComponent,
  ],
})
export class CategoryPage {
  readonly auth = inject(GoogleAuthService);
  readonly library = inject(LibraryService);
  private readonly nav = inject(NavController);
  private readonly player = inject(PlayerLauncher);
  private readonly alertCtrl = inject(AlertController);
  readonly downloads = inject(DownloadsService);

  /** Bound from the `:folderId` route param. */
  readonly folderId = input.required<string>();

  readonly contents = resource({
    params: () => ({ id: this.folderId(), revision: this.library.revision() }),
    loader: async ({ params }) => {
      const [node, trail, children, allSessions] = await Promise.all([
        this.library.getNode(params.id),
        this.library.getTrail(params.id),
        this.library.getChildren(params.id),
        this.library.getDescendantSessions(params.id),
      ]);
      if (!node?.isFolder) return null;
      return {
        node,
        crumbs: toCrumbs(trail.slice(0, -1)),
        categories: children.filter((n) => n.isFolder),
        sessions: children.filter((n) => !n.isFolder),
        allSessions,
      };
    },
  });

  readonly title = computed(() => {
    const node = this.contents.value()?.node;
    return node ? displayName(node) : '';
  });
  readonly countLabel = computed(() =>
    sessionCountLabel(this.contents.value()?.node.sessionCount),
  );
  readonly appearance = computed(() => {
    const node = this.contents.value()?.node;
    return node ? categoryAppearance(node) : null;
  });

  /** Sessions anywhere in this category that aren't stored yet (and aren't on their way). */
  readonly notDownloaded = computed(() => {
    const ids = this.downloads.ids();
    const active = this.downloads.active();
    return (this.contents.value()?.allSessions ?? []).filter((n) => !ids.has(n.id) && !active.has(n.id));
  });
  readonly downloadingCount = computed(() => {
    const active = this.downloads.active();
    return (this.contents.value()?.allSessions ?? []).filter((n) => active.has(n.id)).length;
  });

  constructor() {
    addIcons({ checkmarkCircle, chevronForward, cloudDownloadOutline, cloudOfflineOutline, searchOutline });
  }

  async confirmDownloadAll(): Promise<void> {
    const pending = this.notDownloaded();
    if (!pending.length) return;
    const bytes = pending.reduce((sum, n) => sum + (n.sizeBytes ?? 0), 0);
    const count = sessionCountLabel(pending.length);
    const alert = await this.alertCtrl.create({
      header: `Download ${this.title()}?`,
      message: bytes ? `${count} · about ${formatBytes(bytes)}` : count,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Download', handler: () => void this.downloads.downloadAll(pending) },
      ],
    });
    await alert.present();
  }

  goTo(crumb: Crumb): void {
    void this.nav.navigateBack(crumb.url);
  }

  async refresh(event: RefresherCustomEvent): Promise<void> {
    await this.library.sync();
    await event.target.complete();
  }

  openSession(session: DriveNode): void {
    void this.player.open(session);
  }
}

function toCrumbs(ancestors: DriveNode[]): Crumb[] {
  return [
    { label: 'Explore', url: '/tabs/explore' },
    ...ancestors.map((a) => ({ label: displayName(a), url: `/tabs/explore/${a.id}` })),
  ];
}
