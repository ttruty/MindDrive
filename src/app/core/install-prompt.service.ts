import { Injectable, computed, signal } from '@angular/core';

/** Chromium's install event (not in TypeScript's DOM lib). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallPlatform = 'ios' | 'android' | 'other';
/** How the app can be installed right now: a real prompt, manual iOS steps, or not at all. */
export type InstallMethod = 'native' | 'ios-manual' | null;

const SNOOZE_KEY = 'md.install.snoozedUntil';
const INSTALLED_KEY = 'md.install.installed';
/** "Not now" hides the launch prompt for this long. */
const SNOOZE_DAYS = 7;

/**
 * Knows whether MindDrive can be installed on this device and how. Chromium browsers fire
 * `beforeinstallprompt` (we keep it and show our own UI); iOS has no API, so we explain
 * Share → Add to Home Screen instead.
 */
@Injectable({ providedIn: 'root' })
export class InstallPromptService {
  readonly platform: InstallPlatform = detectPlatform(navigator);
  readonly isMobile = detectMobile(navigator, this.platform);

  private readonly _deferred = signal<BeforeInstallPromptEvent | null>(null);
  private readonly _standalone = signal(isStandalone());
  private readonly _installed = signal(localStorage.getItem(INSTALLED_KEY) === '1');

  /** Already running as an installed app (or installed in this browser). */
  readonly installed = computed(() => this._standalone() || this._installed());

  readonly method = computed<InstallMethod>(() => {
    if (this.installed()) return null;
    if (this._deferred()) return 'native';
    // iOS Safari and (since iOS 16.4) other iOS browsers can Add to Home Screen from the Share sheet.
    if (this.platform === 'ios') return 'ios-manual';
    return null;
  });

  constructor() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // keep Chrome's mini-infobar away; we show our own sheet
      this._deferred.set(e as BeforeInstallPromptEvent);
    });
    window.addEventListener('appinstalled', () => this.markInstalled());
    window
      .matchMedia?.('(display-mode: standalone)')
      .addEventListener?.('change', (e) => this._standalone.set(e.matches || isStandalone()));
  }

  /** Whether to show the prompt automatically at launch. */
  shouldOfferOnLaunch(now = Date.now()): boolean {
    if (!this.isMobile || !this.method()) return false;
    const snoozedUntil = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    return now >= snoozedUntil;
  }

  snooze(now = Date.now()): void {
    localStorage.setItem(SNOOZE_KEY, String(now + SNOOZE_DAYS * 86_400_000));
  }

  /** Show the browser's install dialog. Resolves true if the user accepted. */
  async promptNative(): Promise<boolean> {
    const event = this._deferred();
    if (!event) return false;
    // The event can only be used once.
    this._deferred.set(null);
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') this.markInstalled();
    return outcome === 'accepted';
  }

  private markInstalled(): void {
    localStorage.setItem(INSTALLED_KEY, '1');
    this._installed.set(true);
    this._deferred.set(null);
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function detectPlatform(nav: Navigator): InstallPlatform {
  const ua = nav.userAgent;
  // iPadOS 13+ reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

export function detectMobile(nav: Navigator, platform: InstallPlatform): boolean {
  const uaData = (nav as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return true;
  // Tablets count: installing is just as useful there.
  return platform === 'ios' || platform === 'android';
}
