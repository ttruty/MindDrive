import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
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

  constructor() {
    void this.restoreSession();
  }

  private async restoreSession(): Promise<void> {
    await this.auth.init();
    if (this.auth.isSignedIn()) void this.library.syncIfStale();
  }
}
