import { Injectable, effect, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { InstallPromptService } from '../core/install-prompt.service';
import { InstallSheetComponent } from './install-sheet.component';

/** Let the app settle before inviting an install. */
const LAUNCH_DELAY_MS = 2500;
/** Chromium can fire beforeinstallprompt well after load; still offer it if it lands this soon. */
const LATE_EVENT_WINDOW_MS = 60_000;

/** Offers installation once per launch on phones/tablets, and on demand from Settings. */
@Injectable({ providedIn: 'root' })
export class InstallLauncher {
  private readonly install = inject(InstallPromptService);
  private readonly modalCtrl = inject(ModalController);

  private offeredThisLaunch = false;
  private open = false;
  private launchedAt: number | null = null;

  constructor() {
    // A late beforeinstallprompt (Chromium decides when) still counts as "at launch" for a minute.
    effect(() => {
      const native = this.install.method() === 'native';
      if (native && this.launchedAt !== null && Date.now() - this.launchedAt < LATE_EVENT_WINDOW_MS) {
        setTimeout(() => void this.maybeOffer(), 0);
      }
    });
  }

  /** Call once at startup. */
  offerOnLaunch(): void {
    this.launchedAt = Date.now();
    setTimeout(() => void this.maybeOffer(), LAUNCH_DELAY_MS);
  }

  /** Open the sheet on request (Settings). Dismissing it here doesn't snooze the launch prompt. */
  async show(): Promise<void> {
    await this.present(false);
  }

  private async maybeOffer(): Promise<void> {
    if (this.offeredThisLaunch || !this.install.shouldOfferOnLaunch()) return;
    // Never interrupt a session in progress.
    if (document.querySelector('ion-modal.md-player-modal')) return;
    this.offeredThisLaunch = true;
    await this.present(true);
  }

  private async present(auto: boolean): Promise<void> {
    if (this.open || !this.install.method()) return;
    this.open = true;
    const modal = await this.modalCtrl.create({
      component: InstallSheetComponent,
      cssClass: 'md-install-sheet',
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      handle: true,
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    this.open = false;
    if (auto && role !== 'installed') this.install.snooze();
  }
}
