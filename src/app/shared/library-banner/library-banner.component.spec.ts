import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GoogleAuthService } from '../../core/google-auth.service';
import { LibraryService } from '../../core/library.service';
import { NetworkService } from '../../core/network.service';
import { LibraryBannerComponent } from './library-banner.component';

describe('LibraryBannerComponent', () => {
  const online = signal(true);
  const status = signal('signed-in');
  const root = signal<{ id: string } | null>({ id: 'root' });
  const syncError = signal<string | null>(null);
  const lastSync = signal<object | null>({ syncedAt: 'x' });

  beforeEach(() => {
    online.set(true);
    status.set('signed-in');
    syncError.set(null);
    TestBed.configureTestingModule({
      providers: [
        { provide: NetworkService, useValue: { online } },
        { provide: GoogleAuthService, useValue: { status, signIn: vi.fn(), isSignedIn: () => true } },
        { provide: LibraryService, useValue: { root, syncError, lastSync, sync: vi.fn(), syncIfStale: vi.fn() } },
      ],
    });
  });

  function text(): string {
    const fixture = TestBed.createComponent(LibraryBannerComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';
  }

  it('is empty when everything is fine', () => {
    expect(text()).toBe('');
  });

  it('prioritises offline, then reconnect, then a failed refresh', () => {
    syncError.set('boom');
    expect(text()).toContain("couldn't refresh");

    status.set('reconnect');
    expect(text()).toContain('Reconnect Google Drive');

    online.set(false);
    expect(text()).toContain("You're offline");
  });
});
