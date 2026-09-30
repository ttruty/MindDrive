import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
  RefresherCustomEvent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudOfflineOutline, compassOutline, folderOpenOutline, leafOutline } from 'ionicons/icons';
import { GoogleAuthService } from '../../core/google-auth.service';
import { LibraryService } from '../../core/library.service';
import { DriveNode } from '../../core/models';
import { PlayerLauncher } from '../../player/player-launcher.service';
import { CategoryCardComponent } from '../../shared/category-card/category-card.component';
import { SessionListComponent } from '../../shared/session-list/session-list.component';

@Component({
  selector: 'app-explore',
  templateUrl: 'explore.page.html',
  styleUrls: ['explore.page.scss'],
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonButton,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
    CategoryCardComponent,
    SessionListComponent,
  ],
})
export class ExplorePage {
  readonly auth = inject(GoogleAuthService);
  readonly library = inject(LibraryService);
  private readonly player = inject(PlayerLauncher);

  /** Top level of the library, reloaded whenever a sync completes. */
  readonly contents = resource({
    params: () => {
      const root = this.library.root();
      const synced = this.library.lastSync()?.syncedAt;
      const revision = this.library.revision();
      return root && synced ? { rootId: root.id, synced, revision } : undefined;
    },
    loader: async ({ params }) => {
      const children = await this.library.getChildren(params.rootId);
      return {
        categories: children.filter((n) => n.isFolder),
        sessions: children.filter((n) => !n.isFolder),
      };
    },
  });

  readonly isEmpty = computed(() => {
    const c = this.contents.value();
    return !!c && c.categories.length === 0 && c.sessions.length === 0;
  });

  constructor() {
    addIcons({ cloudOfflineOutline, compassOutline, folderOpenOutline, leafOutline });
  }

  async refresh(event: RefresherCustomEvent): Promise<void> {
    await this.library.sync();
    await event.target.complete();
  }

  openSession(session: DriveNode): void {
    void this.player.open(session);
  }
}
