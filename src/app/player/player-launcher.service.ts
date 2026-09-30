import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { LibraryService } from '../core/library.service';
import { DriveNode } from '../core/models';
import { categoryAppearance, displayName } from '../shared/display';
import { PlayerComponent } from './player.component';

/** Opens the full-screen player for a session. Only one player is open at a time. */
@Injectable({ providedIn: 'root' })
export class PlayerLauncher {
  private readonly modalCtrl = inject(ModalController);
  private readonly library = inject(LibraryService);
  private current?: HTMLIonModalElement;

  /**
   * @param fallbackFolderPath used when the session isn't in the library cache (e.g. a download
   *   whose folder was since cleared or moved).
   */
  async open(session: DriveNode, fallbackFolderPath = ''): Promise<void> {
    const folders = (await this.library.getTrail(session.id)).filter((n) => n.isFolder);
    const category = folders[folders.length - 1];
    const folderPath = folders.length ? folders.map((f) => displayName(f)).join(' / ') : fallbackFolderPath;

    await this.current?.dismiss();
    const modal = await this.modalCtrl.create({
      component: PlayerComponent,
      componentProps: {
        node: session,
        folderPath,
        // Match the colour of the category card the session was opened from.
        appearance: categoryAppearance(category ?? session),
      },
      cssClass: 'md-player-modal',
    });
    this.current = modal;
    void modal.onDidDismiss().then(() => {
      if (this.current === modal) this.current = undefined;
    });
    await modal.present();
  }
}
