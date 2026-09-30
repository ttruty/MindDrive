import { Injectable, signal } from '@angular/core';

/** navigator.onLine as a signal. "Online" can still mean a captive portal; failures are handled per request. */
@Injectable({ providedIn: 'root' })
export class NetworkService {
  private readonly _online = signal(navigator.onLine);
  readonly online = this._online.asReadonly();

  constructor() {
    window.addEventListener('online', () => this._online.set(true));
    window.addEventListener('offline', () => this._online.set(false));
  }
}
