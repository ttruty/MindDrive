import { Component, inject, input, output } from '@angular/core';
import { IonIcon, IonRippleEffect } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmark, play as playIcon } from 'ionicons/icons';
import { DownloadsService } from '../../core/downloads.service';
import { DriveNode } from '../../core/models';
import { NetworkService } from '../../core/network.service';
import { PlaybackService } from '../../core/playback.service';
import { displayName, formatDuration } from '../display';
import { DownloadButtonComponent } from '../download-button/download-button.component';
import { FavoriteButtonComponent } from '../favorite-button/favorite-button.component';

/** A list of playable sessions with per-row favorite + download toggles. Emits `sessionSelect` on tap. */
@Component({
  selector: 'app-session-list',
  templateUrl: 'session-list.component.html',
  styleUrls: ['session-list.component.scss'],
  imports: [IonIcon, IonRippleEffect, DownloadButtonComponent, FavoriteButtonComponent],
})
export class SessionListComponent {
  readonly sessions = input.required<DriveNode[]>();
  readonly sessionSelect = output<DriveNode>();

  protected readonly displayName = displayName;
  protected readonly network = inject(NetworkService);
  protected readonly downloads = inject(DownloadsService);
  protected readonly playback = inject(PlaybackService);

  constructor() {
    addIcons({ checkmark, play: playIcon });
  }

  protected isDone(node: DriveNode): boolean {
    return !!this.playback.progress().get(node.id)?.done;
  }

  protected meta(node: DriveNode): string {
    const kind = node.mimeType.startsWith('video/') ? 'Video' : 'Audio';
    const parts = [kind];
    if (node.durationMs) parts.push(formatDuration(node.durationMs));
    const p = this.playback.progress().get(node.id);
    const totalSec = p?.durationSec ?? (node.durationMs ? node.durationMs / 1000 : 0);
    if (p?.inProgress && totalSec > p.positionSec) {
      parts.push(`${formatDuration((totalSec - p.positionSec) * 1000)} left`);
    } else if (p?.done) {
      parts.push('Done');
    }
    return parts.join(' · ');
  }
}
