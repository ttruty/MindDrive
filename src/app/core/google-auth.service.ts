import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../environments/environment';

export type AuthStatus =
  /** No OAuth client ID in the environment config. */
  | 'unconfigured'
  /** Loading GIS / attempting a silent restore. */
  | 'initializing'
  /** Never connected (or explicitly disconnected). */
  | 'signed-out'
  /** Connected before, but the silent restore didn't succeed — one tap to reconnect. */
  | 'reconnect'
  | 'signed-in';

export interface DriveUser {
  displayName: string;
  emailAddress: string;
  photoLink?: string;
}

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CONSENTED_KEY = 'md.auth.consented';
const HINT_KEY = 'md.auth.hint';
/** Refresh a little before Google's stated expiry so in-flight requests don't race it. */
const EXPIRY_MARGIN_MS = 60_000;
/** A silent (prompt: 'none') request that neither succeeds nor errors is treated as failed. */
const SILENT_TIMEOUT_MS = 15_000;

export class AuthRequiredError extends Error {
  constructor() {
    super('Connect Google Drive in Settings to continue.');
    this.name = 'AuthRequiredError';
  }
}

/**
 * Google Identity Services token client (browser-only, no backend).
 * The access token lives in memory only; a "has consented" flag and login hint are kept in
 * localStorage so a reload can try to restore the session silently.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private readonly _status = signal<AuthStatus>(
    environment.googleClientId ? 'initializing' : 'unconfigured',
  );
  private readonly _error = signal<string | null>(null);
  private readonly _user = signal<DriveUser | null>(null);

  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isSignedIn = computed(() => this._status() === 'signed-in');

  private token: string | null = null;
  private expiresAt = 0;
  private client?: google.accounts.oauth2.TokenClient;
  private gisLoad?: Promise<void>;
  private pending: Promise<string> | null = null;
  private settle?: { resolve: (token: string) => void; reject: (err: Error) => void };

  /** Called once at startup. Never throws. */
  async init(): Promise<void> {
    if (this._status() === 'unconfigured') return;
    try {
      await this.ensureClient();
    } catch {
      // Most likely offline. Previously-connected users can still reach offline content.
      this._status.set(this.hasConsented ? 'reconnect' : 'signed-out');
      return;
    }
    if (!this.hasConsented) {
      this._status.set('signed-out');
      return;
    }
    try {
      await this.requestToken('none');
    } catch {
      // Typically the popup was blocked (no user gesture on load) — ask for one tap instead.
      this._status.set('reconnect');
    }
  }

  /** Interactive sign-in. Call directly from a click handler so the popup isn't blocked. */
  async signIn(): Promise<void> {
    this._error.set(null);
    try {
      await this.ensureClient();
      await this.requestToken(this.hasConsented ? '' : 'consent');
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : String(err));
    }
  }

  signOut(): void {
    if (this.token) google.accounts.oauth2.revoke(this.token, () => undefined);
    this.token = null;
    this.expiresAt = 0;
    this._user.set(null);
    this._error.set(null);
    localStorage.removeItem(CONSENTED_KEY);
    localStorage.removeItem(HINT_KEY);
    this._status.set('signed-out');
  }

  /** Returns a valid access token, re-requesting one from GIS if it has expired. */
  async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - EXPIRY_MARGIN_MS) return this.token;
    if (this._status() !== 'signed-in') throw new AuthRequiredError();
    try {
      return await this.requestToken('');
    } catch {
      // Refresh needs a popup the browser may block outside a user gesture; fall back to one tap.
      this.invalidateToken();
      this._status.set('reconnect');
      throw new AuthRequiredError();
    }
  }

  /** Drop the cached token (e.g. after a 401) so the next getAccessToken() fetches a new one. */
  invalidateToken(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  private get hasConsented(): boolean {
    return localStorage.getItem(CONSENTED_KEY) === '1';
  }

  private async ensureClient(): Promise<void> {
    if (this.client) return;
    await this.loadGis();
    this.client = google.accounts.oauth2.initTokenClient({
      client_id: environment.googleClientId,
      scope: DRIVE_SCOPE,
      callback: (resp) => this.handleTokenResponse(resp),
      error_callback: (err) => this.settle?.reject(new Error(describeClientError(err.type))),
    });
  }

  private loadGis(): Promise<void> {
    this.gisLoad ??= new Promise<void>((resolve, reject) => {
      if ('google' in window && google.accounts?.oauth2) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        this.gisLoad = undefined;
        reject(new Error('Could not load Google sign-in. Check your connection.'));
      };
      document.head.appendChild(script);
    });
    return this.gisLoad;
  }

  private requestToken(prompt: '' | 'none' | 'consent'): Promise<string> {
    if (this.pending) return this.pending;
    const client = this.client;
    if (!client) return Promise.reject(new Error('Google sign-in is not ready yet.'));

    let timer: ReturnType<typeof setTimeout> | undefined;
    this.pending = new Promise<string>((resolve, reject) => {
      this.settle = { resolve, reject };
      if (prompt === 'none') {
        timer = setTimeout(() => reject(new Error('Silent sign-in timed out.')), SILENT_TIMEOUT_MS);
      }
      client.requestAccessToken({
        prompt,
        login_hint: localStorage.getItem(HINT_KEY) ?? undefined,
      });
    }).finally(() => {
      clearTimeout(timer);
      this.pending = null;
      this.settle = undefined;
    });
    return this.pending;
  }

  private handleTokenResponse(resp: google.accounts.oauth2.TokenResponse): void {
    if (resp.error) {
      this.settle?.reject(new Error(resp.error_description || `Google sign-in failed (${resp.error}).`));
      return;
    }
    if (!google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) {
      this.settle?.reject(
        new Error('MindDrive needs permission to view your Drive files. Please allow Drive access.'),
      );
      return;
    }
    this.token = resp.access_token;
    this.expiresAt = Date.now() + Number(resp.expires_in) * 1000;
    localStorage.setItem(CONSENTED_KEY, '1');
    this._error.set(null);
    this._status.set('signed-in');
    this.settle?.resolve(resp.access_token);
    if (!this._user()) void this.loadUser(resp.access_token);
  }

  private async loadUser(token: string): Promise<void> {
    try {
      const res = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)',
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const { user } = (await res.json()) as { user: DriveUser };
      this._user.set(user);
      if (user.emailAddress) localStorage.setItem(HINT_KEY, user.emailAddress);
    } catch {
      // Profile is cosmetic; ignore failures.
    }
  }
}

function describeClientError(type: google.accounts.oauth2.ClientConfigError['type']): string {
  switch (type) {
    case 'popup_failed_to_open':
      return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
    case 'popup_closed':
      return 'Sign-in was cancelled.';
    default:
      return 'Google sign-in failed. Please try again.';
  }
}
