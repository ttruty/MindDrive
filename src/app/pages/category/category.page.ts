import { Component, computed, inject, input, resource } from '@angular/core';
import {
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
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronForward, cloudOfflineOutline, searchOutline } from 'ionicons/icons';
import { GoogleAuthService } from '../../core/google-auth.service';
import { LibraryService } from '../../core/library.service';
import { DriveNode } from '../../core/models';
import { CategoryCardComponent } from '../../shared/category-card/category-card.component';
import { categoryAppearance, displayName, sessionCountLabel } from '../../shared/display';
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
  private readonly toastCtrl = inject(ToastController);

  /** Bound from the `:folderId` route param. */
  readonly folderId = input.required<string>();

  readonly contents = resource({
    params: () => ({ id: this.folderId(), synced: this.library.lastSync()?.syncedAt }),
    loader: async ({ params }) => {
      const [node, trail, children, downloaded] = await Promise.all([
        this.library.getNode(params.id),
        this.library.getTrail(params.id),
        this.library.getChildren(params.id),
        this.library.getDownloadedIds(),
      ]);
      if (!node?.isFolder) return null;
      return {
        node,
        crumbs: toCrumbs(trail.slice(0, -1)),
        categories: children.filter((n) => n.isFolder),
        sessions: children.filter((n) => !n.isFolder),
        downloaded,
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

  constructor() {
    addIcons({ chevronForward, cloudOfflineOutline, searchOutline });
  }

  goTo(crumb: Crumb): void {
    void this.nav.navigateBack(crumb.url);
  }

  async refresh(event: RefresherCustomEvent): Promise<void> {
    await this.library.sync();
    await event.target.complete();
  }

  async openSession(session: DriveNode): Promise<void> {
    // Replaced by the player in Phase 3.
    const toast = await this.toastCtrl.create({
      message: `Playback for “${displayName(session)}” is coming soon.`,
      duration: 1800,
      position: 'top',
    });
    await toast.present();
  }
}

function toCrumbs(ancestors: DriveNode[]): Crumb[] {
  return [
    { label: 'Explore', url: '/tabs/explore' },
    ...ancestors.map((a) => ({ label: displayName(a), url: `/tabs/explore/${a.id}` })),
  ];
}
