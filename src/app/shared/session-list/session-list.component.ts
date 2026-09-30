import { Component, inject, input, output } from '@angular/core';
import { IonIcon, IonRippleEffect } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { play as playIcon } from 'ionicons/icons';
import { DownloadsService } from '../../core/downloads.service';
import { DriveNode } from '../../core/models';
import { NetworkService } from '../../core/network.service';
import { displayName, formatDuration } from '../display';
import { DownloadButtonComponent } from '../download-button/download-button.component';

/** A list of playable sessions with per-row download toggles. Emits `sessionSelect` on tap. */
@Component({
  selector: 'app-session-list',
  templateUrl: 'session-list.component.html',
  styleUrls: ['session-list.component.scss'],
  imports: [IonIcon, IonRippleEffect, DownloadButtonComponent],
})
export class SessionListComponent {
  readonly sessions = input.required<DriveNode[]>();
  readonly sessionSelect = output<DriveNode>();

  protected readonly displayName = displayName;
  protected readonly network = inject(NetworkService);
  protected readonly downloads = inject(DownloadsService);

  constructor() {
    addIcons({ play: playIcon });
  }

  protected meta(node: DriveNode): string {
    const kind = node.mimeType.startsWith('video/') ? 'Video' : 'Audio';
    return node.durationMs ? `${kind} · ${formatDuration(node.durationMs)}` : kind;
  }
}
