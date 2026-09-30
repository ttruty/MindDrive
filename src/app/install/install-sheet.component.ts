import { Component, inject, signal } from '@angular/core';
import { IonButton, IonIcon, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  cloudDoneOutline,
  expandOutline,
  flashOutline,
  shareOutline,
} from 'ionicons/icons';
import { InstallPromptService } from '../core/install-prompt.service';

/**
 * Bottom sheet inviting the listener to install MindDrive. Dismisses with role 'installed',
 * 'later' (snooze) or 'close'.
 */
@Component({
  selector: 'app-install-sheet',
  templateUrl: 'install-sheet.component.html',
  styleUrls: ['install-sheet.component.scss'],
  imports: [IonButton, IonIcon],
})
export class InstallSheetComponent {
  readonly install = inject(InstallPromptService);
  private readonly modalCtrl = inject(ModalController);

  readonly method = this.install.method;
  readonly busy = signal(false);
  /** Chrome on iOS keeps Share in the address bar rather than the bottom toolbar. */
  readonly iosChrome = /CriOS/.test(navigator.userAgent);

  constructor() {
    addIcons({ addCircleOutline, cloudDoneOutline, expandOutline, flashOutline, shareOutline });
  }

  async installNow(): Promise<void> {
    this.busy.set(true);
    try {
      const accepted = await this.install.promptNative();
      await this.modalCtrl.dismiss(null, accepted ? 'installed' : 'later');
    } finally {
      this.busy.set(false);
    }
  }

  later(): void {
    void this.modalCtrl.dismiss(null, 'later');
  }
}
