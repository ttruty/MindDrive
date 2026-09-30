import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { AuthRequiredError } from '../core/google-auth.service';
import { MediaSourceService } from '../core/media-source.service';
import { DriveNode } from '../core/models';
import { PlaybackService } from '../core/playback.service';
import { PlayerComponent } from './player.component';

const node: DriveNode = {
  id: 's1',
  name: '01 - Body Scan.mp3',
  parentId: 'sleep',
  mimeType: 'audio/mpeg',
  isFolder: false,
};

describe('PlayerComponent', () => {
  let fixture: ComponentFixture<PlayerComponent>;
  let resolve: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resolve = vi.fn(async () => ({ url: 'blob:test', source: 'stream', release: vi.fn() }));
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular({ useSetInputAPI: true }),
        { provide: MediaSourceService, useValue: { resolve } },
        { provide: PlaybackService, useValue: { resumePosition: async () => 0, save: vi.fn() } },
      ],
    });
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(PlayerComponent);
    fixture.componentRef.setInput('node', node);
    fixture.componentRef.setInput('folderPath', 'Sleep / Deep Rest');
    fixture.componentRef.setInput('appearance', { icon: 'moon', background: 'red' });
    fixture.detectChanges();
    // load() is plain async work, not an Angular pending task — let it settle.
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the session and its breadcrumb, then the controls once loaded', async () => {
    const el = await render();

    expect(el.querySelector('h1')?.textContent).toBe('Body Scan');
    expect(el.querySelector('.player__meta p')?.textContent).toBe('Sleep / Deep Rest');
    expect(el.querySelector('audio')?.getAttribute('src')).toBe('blob:test');
    expect(el.querySelector('.player__play')).not.toBeNull();
  });

  it('asks to reconnect when streaming needs sign-in', async () => {
    resolve.mockRejectedValueOnce(new AuthRequiredError());
    const el = await render();

    expect(el.querySelector('.player__status')?.textContent).toContain('Reconnect Google Drive');
    expect(el.querySelector('audio')).toBeNull();
  });
});
