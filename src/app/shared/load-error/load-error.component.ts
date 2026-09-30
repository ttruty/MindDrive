import { Component, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircleOutline } from 'ionicons/icons';

/**
 * Shown when on-device storage (IndexedDB) can't be read — e.g. a private window that blocks it,
 * or storage cleared underneath the app.
 */
@Component({
  selector: 'app-load-error',
  template: `
    <section class="md-placeholder" role="alert">
      <div class="md-placeholder__orb"><ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon></div>
      <h2>Something went wrong</h2>
      <p>MindDrive couldn't read its data on this device. Private browsing can block storage — try a regular window.</p>
      <ion-button shape="round" class="md-placeholder__action" (click)="retry.emit()">Try again</ion-button>
    </section>
  `,
  imports: [IonButton, IonIcon],
})
export class LoadErrorComponent {
  readonly retry = output<void>();

  constructor() {
    addIcons({ alertCircleOutline });
  }
}
