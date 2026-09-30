import { Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudOfflineOutline, refreshOutline, syncOutline } from 'ionicons/icons';
import { GoogleAuthService } from '../../core/google-auth.service';
import { LibraryService } from '../../core/library.service';
import { NetworkService } from '../../core/network.service';

type BannerKind = 'offline' | 'reconnect' | 'sync-failed';

/**
 * One-line status above library content. Shows the most important of: offline, needs reconnect,
 * last refresh failed. Renders nothing when all is well.
 */
@Component({
  selector: 'app-library-banner',
  templateUrl: 'library-banner.component.html',
  styleUrls: ['library-banner.component.scss'],
  imports: [IonIcon],
})
export class LibraryBannerComponent {
  private readonly network = inject(NetworkService);
  private readonly auth = inject(GoogleAuthService);
  private readonly library = inject(LibraryService);

  readonly kind = computed<BannerKind | null>(() => {
    if (!this.network.online()) return 'offline';
    // Public libraries work without an account, so there's nothing to reconnect.
    const root = this.library.root();
    if (this.auth.status() === 'reconnect' && root && root.access !== 'public') return 'reconnect';
    if (this.library.syncError() && this.library.lastSync()) return 'sync-failed';
    return null;
  });

  constructor() {
    addIcons({ cloudOfflineOutline, refreshOutline, syncOutline });
  }

  reconnect(): void {
    // Straight from the click so the sign-in popup isn't blocked.
    void this.auth.signIn().then(() => {
      if (this.auth.isSignedIn()) void this.library.syncIfStale();
    });
  }

  retrySync(): void {
    void this.library.sync();
  }
}
