import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudDownloadOutline } from 'ionicons/icons';

@Component({
  selector: 'app-downloads',
  templateUrl: 'downloads.page.html',
  styleUrls: ['downloads.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonIcon],
})
export class DownloadsPage {
  constructor() {
    addIcons({ cloudDownloadOutline });
  }
}
