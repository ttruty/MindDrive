import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonProgressBar,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, cloudDownloadOutline, play, trashOutline } from 'ionicons/icons';
import { DownloadsService, downloadSize } from '../../core/downloads.service';
import { LibraryService } from '../../core/library.service';
import { DownloadedMedia, DriveNode } from '../../core/models';
import { PlayerLauncher } from '../../player/player-launcher.service';
import { LoadErrorComponent } from '../../shared/load-error/load-error.component';
import {
  displayName,
  formatBytes,
  formatDuration,
  sessionCountLabel,
} from '../../shared/display';

interface DownloadGroup {
  folderPath: string;
  items: DownloadedMedia[];
}

@Component({
  selector: 'app-downloads',
  templateUrl: 'downloads.page.html',
  styleUrls: ['downloads.page.scss'],
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonButton,
    IonProgressBar,
    LoadErrorComponent,
  ],
})
export class DownloadsPage {
  readonly downloads = inject(DownloadsService);
  private readonly library = inject(LibraryService);
  private readonly player = inject(PlayerLauncher);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly contents = resource({
    params: () => ({ revision: this.downloads.revision() }),
    loader: async () => {
      const [items, storage] = await Promise.all([
        this.downloads.list(),
        this.downloads.storageInfo(),
      ]);
      return { groups: groupByFolder(items), count: items.length, storage };
    },
  });

  readonly usageFraction = computed(() => {
    const s = this.contents.value()?.storage;
    if (!s?.usageBytes || !s.quotaBytes) return null;
    // Keep a visible sliver so a nearly-empty bar still reads as "some used".
    return Math.min(Math.max(s.usageBytes / s.quotaBytes, 0.01), 1);
  });

  protected readonly formatBytes = formatBytes;
  protected readonly sessionCountLabel = sessionCountLabel;

  constructor() {
    addIcons({ close, cloudDownloadOutline, play, trashOutline });
  }

  title(item: DownloadedMedia): string {
    return displayName({ name: item.name, isFolder: false });
  }

  meta(item: DownloadedMedia): string {
    const kind = item.mimeType.startsWith('video/') ? 'Video' : 'Audio';
    return [kind, item.durationMs && formatDuration(item.durationMs), formatBytes(downloadSize(item))]
      .filter(Boolean)
      .join(' · ');
  }

  async play(item: DownloadedMedia): Promise<void> {
    // Prefer the cached node (it may know a duration learned since); fall back to the download's own data.
    const node: DriveNode = (await this.library.getNode(item.driveId)) ?? {
      id: item.driveId,
      name: item.name,
      parentId: item.parentId ?? null,
      mimeType: item.mimeType,
      isFolder: false,
      ...(item.durationMs ? { durationMs: item.durationMs } : {}),
    };
    await this.player.open(node, item.folderPath);
  }

  async remove(item: DownloadedMedia): Promise<void> {
    await this.downloads.remove(item.driveId);
    const toast = await this.toastCtrl.create({
      message: `Removed “${this.title(item)}”`,
      duration: 1800,
      position: 'top',
    });
    await toast.present();
  }

  async confirmRemoveAll(): Promise<void> {
    const c = this.contents.value();
    if (!c?.count) return;
    const alert = await this.alertCtrl.create({
      header: 'Remove all downloads?',
      message: `${sessionCountLabel(c.count)} · ${formatBytes(c.storage.downloadsBytes)} will be freed. They'll need a connection to play.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Remove all', role: 'destructive', handler: () => this.downloads.removeAll() },
      ],
    });
    await alert.present();
  }
}

function groupByFolder(items: DownloadedMedia[]): DownloadGroup[] {
  const groups = new Map<string, DownloadedMedia[]>();
  for (const item of items) {
    const list = groups.get(item.folderPath) ?? [];
    list.push(item);
    groups.set(item.folderPath, list);
  }
  return [...groups].map(([folderPath, groupItems]) => ({ folderPath, items: groupItems }));
}
