import { Injectable, signal } from '@angular/core';
import { DriveNode } from './models';

export interface CurrentCategory {
  id: string;
  name: string;
  setAt: string;
}

const KEY = 'md.currentCategory';

/** The category the listener is working through right now. Featured on Home with its progress. */
@Injectable({ providedIn: 'root' })
export class CurrentCategoryService {
  private readonly _current = signal<CurrentCategory | null>(read());
  readonly current = this._current.asReadonly();

  isCurrent(id: string): boolean {
    return this._current()?.id === id;
  }

  set(folder: Pick<DriveNode, 'id' | 'name'>): void {
    const value: CurrentCategory = { id: folder.id, name: folder.name, setAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(value));
    this._current.set(value);
  }

  clear(): void {
    localStorage.removeItem(KEY);
    this._current.set(null);
  }
}

function read(): CurrentCategory | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CurrentCategory) : null;
  } catch {
    return null;
  }
}
