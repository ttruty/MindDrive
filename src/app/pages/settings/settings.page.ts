import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  AlertController,
  IonAvatar,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cloudOfflineOutline,
  cloudOutline,
  folderOpenOutline,
  logoGoogle,
  refresh,
  trashOutline,
} from 'ionicons/icons';
import { DownloadsService } from '../../core/downloads.service';
import { GoogleAuthService } from '../../core/google-auth.service';
import { LibraryService, RootFolder } from '../../core/library.service';
import { FolderPickerComponent } from './folder-picker/folder-picker.component';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [
    DatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonNote,
    IonInput,
    IonButton,
    IonIcon,
    IonAvatar,
    IonSpinner,
  ],
})
export class SettingsPage {
  readonly auth = inject(GoogleAuthService);
  readonly library = inject(LibraryService);
  readonly downloads = inject(DownloadsService);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly folderInput = signal('');
  readonly rootError = signal<string | null>(null);
  readonly settingRoot = signal(false);

  constructor() {
    addIcons({ cloudOfflineOutline, cloudOutline, folderOpenOutline, logoGoogle, refresh, trashOutline });
  }

  async connect(): Promise<void> {
    await this.auth.signIn();
    if (this.auth.isSignedIn()) void this.library.syncIfStale();
  }

  async confirmDisconnect(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Disconnect Google Drive?',
      message: 'Your library cache and downloads stay on this device. You can reconnect anytime.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Disconnect', role: 'destructive', handler: () => this.auth.signOut() },
      ],
    });
    await alert.present();
  }

  useFolderLink(): Promise<void> {
    return this.changeRoot(() => this.library.setRootFromInput(this.folderInput()));
  }

  async browse(): Promise<void> {
    const modal = await this.modalCtrl.create({ component: FolderPickerComponent });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<RootFolder>();
    if (role === 'select' && data) await this.changeRoot(() => this.library.setRoot(data.id));
  }

  sync(): void {
    void this.library.sync();
  }

  async confirmClearCache(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Clear library cache?',
      message: 'Your library will be re-read from Google Drive on the next sync. Downloads are not affected.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear',
          role: 'destructive',
          handler: async () => {
            await this.library.clearCache();
            await this.toast('Library cache cleared');
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmClearDownloads(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Clear all downloads?',
      message: 'Sessions will need a connection to play until you download them again.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear',
          role: 'destructive',
          handler: async () => {
            await this.downloads.removeAll();
            await this.toast('Downloads cleared');
          },
        },
      ],
    });
    await alert.present();
  }

  private async changeRoot(action: () => Promise<RootFolder>): Promise<void> {
    this.settingRoot.set(true);
    this.rootError.set(null);
    try {
      const root = await action();
      this.folderInput.set('');
      if (!this.library.syncError()) await this.toast(`Library set to “${root.name}”`);
    } catch (err) {
      this.rootError.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.settingRoot.set(false);
    }
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2000, position: 'top' });
    await toast.present();
  }
}
