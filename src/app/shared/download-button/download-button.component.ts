import { Component, computed, inject, input } from '@angular/core';
import { AlertController, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowDownCircleOutline, checkmarkCircle, close } from 'ionicons/icons';
import { DownloadsService } from '../../core/downloads.service';
import { DriveNode } from '../../core/models';
import { displayName } from '../display';

/**
 * Download toggle for one session: download → progress ring (tap to cancel) → saved (tap to remove).
 * Stops click propagation so it can sit inside a tappable row.
 */
@Component({
  selector: 'app-download-button',
  templateUrl: 'download-button.component.html',
  styleUrls: ['download-button.component.scss'],
  imports: [IonIcon],
  host: { '[class.light]': "variant() === 'light'" },
})
export class DownloadButtonComponent {
  readonly node = input.required<DriveNode>();
  /** 'light' = white-on-colour, for the player. */
  readonly variant = input<'default' | 'light'>('default');

  private readonly downloads = inject(DownloadsService);
  private readonly alertCtrl = inject(AlertController);

  readonly downloaded = computed(() => this.downloads.ids().has(this.node().id));
  readonly active = computed(() => this.downloads.active().get(this.node().id) ?? null);
  /** stroke-dashoffset for the progress ring (circumference ≈ 94.2 for r=15). */
  readonly ringOffset = computed(() => 94.2 * (1 - (this.active()?.progress ?? 0)));

  readonly label = computed(() => {
    const name = displayName(this.node());
    if (this.downloaded()) return `Remove download of ${name}`;
    if (this.active()) return `Cancel download of ${name}`;
    return `Download ${name}`;
  });

  constructor() {
    addIcons({ arrowDownCircleOutline, checkmarkCircle, close });
  }

  async onClick(event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    const node = this.node();
    if (this.active()) {
      this.downloads.cancel(node.id);
    } else if (this.downloaded()) {
      const alert = await this.alertCtrl.create({
        header: 'Remove download?',
        message: `“${displayName(node)}” will need a connection to play.`,
        buttons: [
          { text: 'Keep', role: 'cancel' },
          { text: 'Remove', role: 'destructive', handler: () => this.downloads.remove(node.id) },
        ],
      });
      await alert.present();
    } else {
      this.downloads.download(node);
    }
  }
}
