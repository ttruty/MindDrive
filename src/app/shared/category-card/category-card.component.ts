import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon, IonRippleEffect, IonRouterLinkWithHref } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bandage,
  bulb,
  cloud,
  flower,
  happy,
  heart,
  infinite,
  leaf,
  moon,
  musicalNotes,
  planet,
  rainy,
  school,
  sparkles,
  star,
  sunny,
  walk,
  water,
} from 'ionicons/icons';
import { collectionProgress } from '../../core/collection-progress';
import { CurrentCategoryService } from '../../core/current-category.service';
import { LibraryService } from '../../core/library.service';
import { DriveNode } from '../../core/models';
import { PlaybackService } from '../../core/playback.service';
import { categoryAppearance, displayName, sessionCountLabel } from '../display';

/** A Drive folder presented as a Headspace-style category tile. */
@Component({
  selector: 'app-category-card',
  templateUrl: 'category-card.component.html',
  styleUrls: ['category-card.component.scss'],
  imports: [RouterLink, IonRouterLinkWithHref, IonIcon, IonRippleEffect],
})
export class CategoryCardComponent {
  readonly node = input.required<DriveNode>();

  private readonly library = inject(LibraryService);
  private readonly playback = inject(PlaybackService);
  private readonly currentCategory = inject(CurrentCategoryService);

  /** Every session beneath this category, for its "N done" count. */
  private readonly sessions = resource({
    params: () => ({ id: this.node().id, revision: this.library.revision() }),
    loader: ({ params }) => this.library.getDescendantSessions(params.id),
  });

  readonly title = computed(() => displayName(this.node()));
  readonly isCurrent = computed(() => this.currentCategory.current()?.id === this.node().id);
  readonly countLabel = computed(() => {
    const base = sessionCountLabel(this.node().sessionCount);
    const sessions = this.sessions.value();
    if (!sessions?.length) return base;
    const p = collectionProgress(sessions, this.playback.progress());
    if (p.allDone) return `All ${p.total} done`;
    return p.done ? `${base} · ${p.done} done` : base;
  });
  readonly appearance = computed(() => categoryAppearance(this.node()));

  constructor() {
    // Every icon categoryAppearance() can return must be registered here.
    addIcons({
      bandage, bulb, cloud, flower, happy, heart, infinite, leaf, moon,
      musicalNotes, planet, rainy, school, sparkles, star, sunny, walk, water,
    });
  }
}
