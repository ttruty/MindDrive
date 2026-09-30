# MindDrive — Headspace-style PWA driven by Google Drive

Living spec for this repo. Read it fully at the start of every session and keep it updated
(phase status, decisions, deviations) as work lands.

## 1. Project overview

A single-user Angular + Ionic PWA that turns a personal Google Drive folder into a Headspace-like
meditation/audio app: browse content organized by Drive folders, stream or download sessions for
offline playback, and track a daily streak on the home screen.

Single user, single Google account, no backend — everything lives client-side (IndexedDB) after OAuth.

## 2. Tech stack

- **Angular 22** (standalone components, signals for state) + **Ionic 9** (`@ionic/angular`) for UI shell/navigation
  - The spec originally said Ionic 8; the current Ionic CLI starter scaffolds Ionic 9 / Angular 22, so we're on those.
- **PWA**: Angular service worker (`@angular/pwa` / `@angular/service-worker`) for app-shell caching; installable manifest
- **Auth**: Google Identity Services (GIS), scope `https://www.googleapis.com/auth/drive.readonly`
- **Drive API v3**: `files.list` (walk folder tree via `parents` + `mimeType` queries), `files.get?alt=media` for content
- **Offline storage**: IndexedDB via the `idb` library — three object stores: `driveCache` (folder/file metadata),
  `mediaBlobs` (downloaded audio/video blobs + metadata), `streakLog` (date strings of days with activity)
- **Playback**: native `<video>`/`<audio>` with a custom control bar; blob URLs for downloaded content,
  fetch + Blob URL (with `Authorization: Bearer <token>`) for streamed content — Drive's `alt=media`
  endpoint needs the auth header, so a plain `src=url` won't work
- **Capacitor is not in scope** — pure installable PWA first. The Ionic starter's Capacitor integration
  was deliberately removed in Phase 0; a native wrap can come later.

## 3. Core data model (IndexedDB)

```ts
// driveCache store — mirrors the Drive folder tree under the configured root
interface DriveNode {
  id: string;            // Drive file/folder id
  name: string;
  parentId: string | null;
  mimeType: string;      // 'application/vnd.google-apps.folder' or audio/video mime
  isFolder: boolean;
  sizeBytes?: number;
  modifiedTime?: string;
}

// mediaBlobs store — downloaded content
interface DownloadedMedia {
  driveId: string;       // matches DriveNode.id
  name: string;
  folderPath: string;    // human-readable breadcrumb, e.g. "Sleep / Deep Rest"
  mimeType: string;
  blob: Blob;
  downloadedAt: string;  // ISO date
  lastPositionSec?: number; // resume playback
}

// streakLog store — one entry per calendar day with any playback
interface StreakEntry {
  date: string;   // 'YYYY-MM-DD', local time
  sessionsPlayed: number; // count, for stats — not required for the streak itself
}
```

Streak day counts on any playback started that day (no minimum duration). Current streak = consecutive
days ending today or yesterday; longest streak = max run in the log. Both computed client-side from
`streakLog`, no server.

## 4. Screens / flow

- **Home** (tab 1): streak grid (12-week GitHub-style heatmap, current streak number, longest streak),
  "Continue listening" card (last played, with resume position), 3–4 quick-pick category cards
- **Explore** (tab 2): Drive folder browser starting at the configured root — folders render as category
  cards (representative icon/color, no thumbnails needed); tapping in shows subfolders and files; files
  render as a session list (name, duration if known, downloaded badge)
- **Player** (modal/full screen): cover art placeholder, title, breadcrumb, transport controls, download
  toggle, scrubber that writes `lastPositionSec` periodically
- **Downloads** (tab 3): everything in `mediaBlobs`, storage used, per-item delete, "download all in folder"
- **Settings** (tab 4): Google sign-in/sign-out, root folder picker (paste a folder ID/link or
  browse-to-select), clear cache, clear downloads

Navigation should feel like Headspace, not a file browser: folders are framed as "categories," never
expose raw Drive chrome (file icons, "My Drive," etc.).

## 5. Google Drive integration notes

- OAuth via GIS token client (`google.accounts.oauth2.initTokenClient`), `drive.readonly` scope only — no write access
  - Note for Phase 1: the GIS *token* client is a browser-only implicit-style flow (no PKCE, no refresh
    token); PKCE applies to the GIS *code* client, which needs a backend to exchange the code. Given
    "no backend," use the token client and re-request tokens on expiry (~1h).
- Access token held **in memory only** (not persisted); on reload, attempt a silent re-auth
  (`requestAccessToken({ prompt: '' })`) if the user has previously consented, otherwise show a
  "Connect Google Drive" state
- Root folder is configured once (folder ID, extracted from a pasted Drive URL) and stored locally — not hardcoded
- List children: `files.list` with `q: "'{parentId}' in parents and trashed = false"`,
  fields `id, name, mimeType, size, modifiedTime` (handle `nextPageToken` pagination)
- Treat any `audio/*` or `video/*` mimeType as playable; anything else is hidden, not an error

## 6. Build phases (one Claude Code session each)

| Phase | Scope | Status |
|---|---|---|
| 0 | Ionic Angular PWA scaffold, routing, tab shell, theme, this CLAUDE.md | ✅ Done |
| 1 | Google OAuth (GIS) + Drive service: sign-in/out, token handling, root-folder picker, `files.list` folder-tree walk, `driveCache` store | ✅ Done |
| 2 | Explore UI: category cards from top-level folders, drill-down, session list, breadcrumbs | ✅ Done |
| 3 | Player: audio/video playback (authenticated blob fetch), custom controls, resume position | ⏳ Next |
| 4 | Downloads: store blobs in `mediaBlobs`, prefer local blob over network, Downloads tab UI, storage usage + delete | |
| 5 | Streak: `streakLog` writes on playback start, streak calc, home heatmap, "Continue listening" | |
| 6 | Polish: real icons/manifest branding, SW caching strategy, empty/loading/error states, responsive pass | |

## 7. Repo conventions (as built)

- **Commands**: `npm start` (dev server on **http://localhost:8100** — matches the OAuth origin),
  `npm run build` (prod build → `www/`, service worker enabled), `npm test` (Vitest), `npm run lint`
- The service worker is **disabled in dev** (`isDevMode()`); test PWA behaviour against a prod build
  served statically, e.g. `npx http-server www -p 8100 -s --proxy 'http://localhost:8100?'`
- **Layout**
  - `src/app/tabs/` — tab shell (`tabs.page.*`) and child routes (`tabs.routes.ts`): `/tabs/home|explore|downloads|settings`,
    plus `/tabs/explore/:folderId` (category drill-down, stacked inside the Explore tab)
  - `src/app/pages/<name>/` — one folder per tab page (standalone, `IonXxx` imports from `@ionic/angular`)
  - `src/app/core/` — services and models (see §8); future player/streak services go here too
  - `src/app/shared/` — reusable UI (`category-card`, `session-list`) and `display.ts` helpers
- **Theme**: `src/theme/variables.scss` defines the Ionic color palette + surfaces for light and dark
  (`prefers-color-scheme`). Dark overrides use `:root, :root.ios, :root.md` to beat Ionic's
  `dark.system.css` specificity. App-specific tokens are `--md-*` (surface, radius, shadow, orb gradient) —
  use these instead of raw hex in components. Shared global styles (e.g. `.md-placeholder` empty state)
  live in `src/global.scss`.
- **PWA**: `public/manifest.webmanifest` + `public/icons/*` (placeholder Angular icons until Phase 6),
  `ngsw-config.json` (app shell prefetch, assets lazy). Drive media must **never** go through ngsw
  caching — offline media lives in IndexedDB (`mediaBlobs`).

## 8. Core services (Phase 1, as built)

All in `src/app/core/`, `providedIn: 'root'`, state exposed as read-only signals.

- **`models.ts`** — `DriveNode`, `DownloadedMedia`, `StreakEntry`, `FOLDER_MIME`, `isPlayableMime()`.
- **`db.service.ts`** — single `idb` connection to DB `minddrive` v1. Creates all three stores up front:
  `driveCache` (keyPath `id`, index `parentId`), `mediaBlobs` (keyPath `driveId`), `streakLog` (keyPath `date`).
  Bump `DB_VERSION` and add an upgrade step for any schema change.
- **`google-auth.service.ts`** — GIS token client, loads `accounts.google.com/gsi/client` lazily.
  - `status`: `unconfigured` (no client ID) → `initializing` → `signed-out` | `reconnect` | `signed-in`.
  - Token is in memory only. localStorage keeps `md.auth.consented` + `md.auth.hint` (email, used as `login_hint`).
  - On startup `init()` tries a silent `prompt: 'none'` request. Browsers usually block that popup without a
    user gesture, so the common result after a reload is `reconnect` ("Welcome back — tap to reconnect").
    That's expected, not a bug.
  - `getAccessToken()` refreshes near expiry; if the refresh fails it drops to `reconnect` and throws
    `AuthRequiredError`. `signIn()` must be called straight from a click handler (popup blocking).
  - `user` signal comes from Drive `about.get` (works with `drive.readonly`; no extra scopes).
- **`drive-api.service.ts`** — authenticated `fetch` for Drive v3: `getFile(id)`, `listChildren(parentId,
  { foldersOnly })` (paginates, `orderBy: folder,name_natural`, shared-drive flags on). Retries once on 401
  (after invalidating the token) and backs off on 429 / 5xx / 403 rate-limit reasons. Throws `DriveApiError`.
- **`drive-url.ts`** — `parseFolderId()` for pasted links (`/folders/<id>`, `/u/N/folders/<id>`, `open?id=`) or bare IDs.
- **`library.service.ts`** — library root + tree cache.
  - Root `{id, name}` in localStorage `md.library.root`; last-sync summary in `md.library.lastSync`.
  - `sync()` walks the tree breadth-first (4 `files.list` calls in parallel), keeps folders + audio/video only,
    then replaces `driveCache` in one transaction. The root node itself is stored with `parentId: null`.
    Concurrent calls share one run; failures go to `syncError` and leave the previous cache intact.
  - `syncIfStale()` (older than 12h) runs on startup and after connecting. Settings has a manual sync button.
  - Read API for Phase 2: `getNode(id)`, `getChildren(parentId)` (folders first, natural name sort).
  - Each folder gets `sessionCount` (playable files anywhere beneath it) during sync. `getChildren()` hides
    folders whose count is 0. Video `durationMs` comes from Drive's `videoMediaMetadata`; audio has none.
  - `CACHE_FORMAT` is stored in the sync summary. Bump it whenever sync starts computing new fields, and
    `syncIfStale()` will rebuild older caches automatically.
  - `getTrail(id)` returns the folders from just below the root down to `id` (for breadcrumbs).
    `getDownloadedIds()` returns the keys in `mediaBlobs` (for "Downloaded" badges).
- **Settings** (`pages/settings/`): connect/reconnect/disconnect, library folder via pasted link or the
  `FolderPickerComponent` modal (browses the user's own Drive from `root`; shared folders are set by pasting a link),
  sync status/progress, clear library cache. "Clear downloads" is a placeholder until Phase 4.
- **Tests**: `fake-indexeddb/auto` is loaded in `src/test-setup.ts`; `library.service.spec.ts` shows the pattern
  (fake `DriveApiService` + real `DbService`, `deleteDB` between tests).

## 9. Explore UI (Phase 2, as built)

- **`pages/explore/`** (`/tabs/explore`): the library's top level. Folders show as a grid of category cards, and
  any files directly in the root show as a "Sessions" list. Empty states cover: not connected, no library
  folder, first sync running or failed, reconnect needed, and library empty. Pull-to-refresh runs `library.sync()`.
  If a refresh fails and cached data exists, a small banner says so and the cached library stays visible
  (works offline).
- **`pages/category/`** (`/tabs/explore/:folderId`, `folderId` bound as a signal input): breadcrumb
  (`Explore › …ancestors › current`, links use `NavController.navigateBack`), a gradient hero, sub-categories
  ("Collections") and sessions. If the id is no longer in the cache it shows "This category has moved".
- Both pages load from IndexedDB with Angular `resource()`, keyed on `library.lastSync().syncedAt`, so they
  reload automatically when a sync finishes.
- **`shared/category-card`**: gradient tile that links to `/tabs/explore/<id>`. Every icon
  `categoryAppearance()` can return must be registered in its `addIcons` call.
- **`shared/session-list`**: rows showing play button, cleaned title, "Audio"/"Video · 12 min" and a
  Downloaded badge. Emits `(sessionSelect)` with the `DriveNode`.
- **`shared/display.ts`**:
  - `displayName()` strips the file extension, leading track numbers like "01 - ", and underscores. Never
    show raw Drive names in the UI.
  - `formatDuration()` and `sessionCountLabel()` format durations and "N sessions" labels.
  - `categoryAppearance()` picks an icon from keywords in the name (sleep→moon, focus→bulb, …) and a
    gradient from a hash of the id, so a category looks the same everywhere.
- **Phase 3 hook:** `openSession()` in `explore.page.ts` and `category.page.ts` currently shows a
  "coming soon" toast. Replace both with opening the player. The player can also save audio durations
  it learns back into `driveCache`.
