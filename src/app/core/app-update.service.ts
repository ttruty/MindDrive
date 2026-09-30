import { Injectable, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { ToastController } from '@ionic/angular';
import { filter } from 'rxjs';

/** Check for new app versions hourly. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/** Surfaces service-worker updates: a quiet "new version" toast, and a forced reload if the cache broke. */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly sw = inject(SwUpdate);
  private readonly toastCtrl = inject(ToastController);

  init(): void {
    if (!this.sw.isEnabled) return; // dev server / unsupported browser

    this.sw.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => void this.offerReload());

    this.sw.unrecoverable.subscribe(() => void this.forceReload());

    setInterval(() => void this.sw.checkForUpdate().catch(() => undefined), CHECK_EVERY_MS);
  }

  private async offerReload(): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: 'A new version of MindDrive is ready.',
      position: 'bottom',
      buttons: [
        { text: 'Reload', handler: () => document.location.reload() },
        { text: 'Later', role: 'cancel' },
      ],
    });
    await toast.present();
  }

  private async forceReload(): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: 'MindDrive needs to reload to finish updating.',
      position: 'bottom',
      buttons: [{ text: 'Reload', handler: () => document.location.reload() }],
    });
    await toast.present();
  }
}
