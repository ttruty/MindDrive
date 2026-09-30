import { Component, computed, input } from '@angular/core';
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
import { DriveNode } from '../../core/models';
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

  readonly title = computed(() => displayName(this.node()));
  readonly countLabel = computed(() => sessionCountLabel(this.node().sessionCount));
  readonly appearance = computed(() => categoryAppearance(this.node()));

  constructor() {
    // Every icon categoryAppearance() can return must be registered here.
    addIcons({
      bandage, bulb, cloud, flower, happy, heart, infinite, leaf, moon,
      musicalNotes, planet, rainy, school, sparkles, star, sunny, walk, water,
    });
  }
}
