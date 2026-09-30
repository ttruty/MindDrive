import { Component, effect, inject } from '@angular/core';
import { IonApp, IonRouterOutlet, ToastController } from '@ionic/angular';
import { DownloadsService } from './core/downloads.service';
import { GoogleAuthService } from './core/google-auth.service';
import { LibraryService } from './core/library.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private readonly auth = inject(GoogleAuthService);
  private readonly library = inject(LibraryService);
  private readonly downloads = inject(DownloadsService);
  private readonly toastCtrl = inject(ToastController);

  constructor() {
    void this.restoreSession();

    // Downloads run in the background (often several at once), so failures surface app-wide.
    effect(() => {
      const failure = this.downloads.lastError();
      if (failure) void this.toast(failure.message);
    });
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3500, position: 'top', color: 'dark' });
    await toast.present();
  }

  private async restoreSession(): Promise<void> {
    await this.auth.init();
    if (this.auth.isSignedIn()) void this.library.syncIfStale();
  }
}
