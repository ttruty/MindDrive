import { Component, computed, inject, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { heart, heartOutline } from 'ionicons/icons';
import { FavoritesService } from '../../core/favorites.service';
import { DriveNode } from '../../core/models';
import { displayName } from '../display';

/** Heart toggle for a session. Stops click propagation so it can sit inside a tappable row. */
@Component({
  selector: 'app-favorite-button',
  template: `
    <button
      type="button"
      class="fav"
      [class.fav--on]="favorite()"
      [class.fav--pop]="pop()"
      [attr.aria-pressed]="favorite()"
      [attr.aria-label]="(favorite() ? 'Remove from favorites: ' : 'Add to favorites: ') + name()"
      [title]="favorite() ? 'Remove from favorites' : 'Add to favorites'"
      (click)="onClick($event)"
      (animationend)="pop.set(false)"
    >
      <ion-icon [name]="favorite() ? 'heart' : 'heart-outline'" aria-hidden="true"></ion-icon>
    </button>
  `,
  styles: `
    :host {
      --fav-color: var(--ion-color-medium);
      --fav-on: var(--ion-color-danger);
      display: inline-block;
    }
    :host(.light) {
      --fav-color: #fff;
      --fav-on: #fff;
    }
    .fav {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--fav-color);
      font-size: 24px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .fav:focus-visible { outline: 2px solid var(--ion-color-primary); }
    .fav--on { color: var(--fav-on); }
    .fav--pop ion-icon { animation: fav-pop 280ms ease-out; }
    @keyframes fav-pop {
      50% { transform: scale(1.3); }
    }
    @media (prefers-reduced-motion: reduce) {
      .fav--pop ion-icon { animation: none; }
    }
  `,
  imports: [IonIcon],
  host: { '[class.light]': "variant() === 'light'" },
})
export class FavoriteButtonComponent {
  readonly node = input.required<DriveNode>();
  /** 'light' = white-on-colour, for the player. */
  readonly variant = input<'default' | 'light'>('default');

  private readonly favorites = inject(FavoritesService);

  readonly favorite = computed(() => this.favorites.ids().has(this.node().id));
  readonly name = computed(() => displayName(this.node()));
  readonly pop = signal(false);

  constructor() {
    addIcons({ heart, heartOutline });
  }

  onClick(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (!this.favorite()) this.pop.set(true);
    void this.favorites.toggle(this.node());
  }
}
