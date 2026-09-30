import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'home',
        children: [
          {
            path: '',
            loadComponent: () => import('../pages/home/home.page').then((m) => m.HomePage),
          },
          {
            path: 'favorites',
            loadComponent: () =>
              import('../pages/favorites/favorites.page').then((m) => m.FavoritesPage),
          },
        ],
      },
      {
        path: 'explore',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('../pages/explore/explore.page').then((m) => m.ExplorePage),
          },
          {
            path: ':folderId',
            loadComponent: () =>
              import('../pages/category/category.page').then((m) => m.CategoryPage),
          },
        ],
      },
      {
        path: 'downloads',
        loadComponent: () =>
          import('../pages/downloads/downloads.page').then((m) => m.DownloadsPage),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('../pages/settings/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: '',
        redirectTo: '/tabs/home',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/home',
    pathMatch: 'full',
  },
];
