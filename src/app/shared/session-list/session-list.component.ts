import { Component, input, output } from '@angular/core';
import { IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, play as playIcon } from 'ionicons/icons';
import { DriveNode } from '../../core/models';
import { displayName, formatDuration } from '../display';

/** A list of playable sessions. Emits `sessionSelect` when one is tapped. */
@Component({
  selector: 'app-session-list',
  templateUrl: 'session-list.component.html',
  styleUrls: ['session-list.component.scss'],
  imports: [IonList, IonItem, IonLabel, IonIcon],
})
export class SessionListComponent {
  readonly sessions = input.required<DriveNode[]>();
  readonly downloaded = input<ReadonlySet<string>>(new Set());
  readonly sessionSelect = output<DriveNode>();

  protected readonly displayName = displayName;

  constructor() {
    addIcons({ checkmarkCircle, play: playIcon });
  }

  protected meta(node: DriveNode): string {
    const kind = node.mimeType.startsWith('video/') ? 'Video' : 'Audio';
    return node.durationMs ? `${kind} · ${formatDuration(node.durationMs)}` : kind;
  }
}
