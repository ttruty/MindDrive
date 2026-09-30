import { Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronBack, chevronForward, folderOpenOutline } from 'ionicons/icons';
import { DriveApiService } from '../../../core/drive-api.service';
import { RootFolder } from '../../../core/library.service';
import { DriveNode } from '../../../core/models';

/** Browse Drive folders and pick one as the library root. Dismisses with role 'select'. */
@Component({
  selector: 'app-folder-picker',
  templateUrl: 'folder-picker.component.html',
  styleUrls: ['folder-picker.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonSpinner,
    IonFooter,
  ],
})
export class FolderPickerComponent {
  private readonly modal = inject(ModalController);
  private readonly api = inject(DriveApiService);

  // 'root' is Drive's alias for the top of the user's own Drive.
  readonly trail = signal<RootFolder[]>([{ id: 'root', name: 'Your Drive' }]);
  readonly current = computed(() => this.trail()[this.trail().length - 1]);
  readonly atTop = computed(() => this.trail().length === 1);
  readonly folders = signal<DriveNode[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private loadSeq = 0;

  constructor() {
    addIcons({ chevronBack, chevronForward, folderOpenOutline });
    void this.load();
  }

  open(folder: DriveNode): void {
    this.trail.update((t) => [...t, { id: folder.id, name: folder.name }]);
    void this.load();
  }

  back(): void {
    this.trail.update((t) => t.slice(0, -1));
    void this.load();
  }

  choose(): void {
    void this.modal.dismiss(this.current(), 'select');
  }

  cancel(): void {
    void this.modal.dismiss(null, 'cancel');
  }

  async load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.error.set(null);
    this.folders.set([]);
    try {
      const folders = await this.api.listChildren(this.current().id, { foldersOnly: true });
      if (seq === this.loadSeq) this.folders.set(folders);
    } catch (err) {
      if (seq === this.loadSeq) this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }
}
