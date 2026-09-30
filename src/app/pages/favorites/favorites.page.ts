import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { heartOutline } from 'ionicons/icons';
import { FavoritesService } from '../../core/favorites.service';
import { DriveNode } from '../../core/models';
import { PlayerLauncher } from '../../player/player-launcher.service';
import { LoadErrorComponent } from '../../shared/load-error/load-error.component';
import { SessionListComponent } from '../../shared/session-list/session-list.component';

/** Every favorited session, newest first. Lives in the Home tab's stack (/tabs/home/favorites). */
@Component({
  selector: 'app-favorites',
  templateUrl: 'favorites.page.html',
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonIcon,
    IonButton,
    IonSpinner,
    SessionListComponent,
    LoadErrorComponent,
  ],
})
export class FavoritesPage {
  private readonly favorites = inject(FavoritesService);
  private readonly player = inject(PlayerLauncher);

  readonly items = resource({
    params: () => ({ revision: this.favorites.revision() }),
    loader: async () => {
      const list = await this.favorites.listAsNodes();
      return {
        nodes: list.map((i) => i.node),
        folderPaths: new Map(list.map((i) => [i.node.id, i.folderPath])),
      };
    },
  });

  constructor() {
    addIcons({ heartOutline });
  }

  openSession(node: DriveNode): void {
    void this.player.open(node, this.items.value()?.folderPaths.get(node.id) ?? '');
  }
}
