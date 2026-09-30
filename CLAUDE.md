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
- **Offline storage**: IndexedDB via the `idb` library — object stores: `driveCache` (folder/file metadata),
  `mediaBlobs` (downloaded audio/video blobs + metadata), `streakLog` (date strings of days with activity),
  `playback` (resume positions + recently played, added in DB v2 / Phase 3), `favorites` (DB v3)
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
  lastPositionSec?: number; // unused — resume lives in the playback store (below)
  parentId?: string | null; // added Phase 4
  durationMs?: number;      // added Phase 4
  sizeBytes?: number;       // added Phase 4 — blob.size at download time
}

// playback store (DB v2) — resume position + recently played, for streamed AND downloaded sessions
interface PlaybackEntry {
  driveId: string;
  name: string;
  mimeType: string;
  parentId: string | null;
  folderPath: string;     // "Sleep / Deep Rest"
  positionSec: number;
  durationSec?: number;
  completed: boolean;     // played to (near) the end → next play starts over
  updatedAt: string;      // ISO; indexed, drives "Continue listening"
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
| 3 | Player: audio/video playback (authenticated blob fetch), custom controls, resume position | ✅ Done |
| 4 | Downloads: store blobs in `mediaBlobs`, prefer local blob over network, Downloads tab UI, storage usage + delete | ✅ Done |
| 5 | Streak: `streakLog` writes on playback start, streak calc, home heatmap, "Continue listening" | ✅ Done |
| 6 | Polish: real icons/manifest branding, SW caching strategy, empty/loading/error states, responsive pass | ✅ Done |

## 7. Repo conventions (as built)

- **Commands**: `npm start` (dev server on **http://localhost:8100** — matches the OAuth origin),
  `npm run build` (prod build → `www/`, service worker enabled), `npm run preview` (prod build served on
  :8100 with the service worker), `npm test` (Vitest), `npm run lint`
- The service worker is **disabled in dev** (`isDevMode()`). Test PWA behaviour with `npm run preview`.
  Stop `npm start` first; both use port 8100.
- **Layout**
  - `src/app/tabs/` — tab shell (`tabs.page.*`) and child routes (`tabs.routes.ts`): `/tabs/home|explore|downloads|settings`,
    plus `/tabs/explore/:folderId` (category drill-down, stacked inside the Explore tab)
  - `src/app/pages/<name>/` — one folder per tab page (standalone, `IonXxx` imports from `@ionic/angular`)
  - `src/app/core/` — services and models (see §8); future player/streak services go here too
  - `src/app/shared/` — reusable UI (`category-card`, `session-list`) and `display.ts` helpers
- **Theme** (AA contrast checked in Phase 6): `src/theme/variables.scss` defines the Ionic color palette + surfaces for light and dark
  (`prefers-color-scheme`). Dark overrides use `:root, :root.ios, :root.md` to beat Ionic's
  `dark.system.css` specificity. App-specific tokens are `--md-*` (surface, radius, shadow, orb gradient) —
  use these instead of raw hex in components. Shared global styles (e.g. `.md-placeholder` empty state)
  live in `src/global.scss`.
- **PWA**: `public/manifest.webmanifest` + `public/icons/*` + `ngsw-config.json`. See §13. Drive media must
  **never** go through ngsw caching; offline media lives in IndexedDB (`mediaBlobs`).

## 8. Core services (Phase 1, as built)

All in `src/app/core/`, `providedIn: 'root'`, state exposed as read-only signals.

- **`models.ts`** — `DriveNode`, `DownloadedMedia`, `StreakEntry`, `FOLDER_MIME`, `isPlayableMime()`.
- **`db.service.ts`** — single `idb` connection to DB `minddrive`, currently **v3** (v3 adds `favorites`, keyPath
  `driveId`, index `addedAt`). v1: `driveCache` (keyPath `id`,
  index `parentId`), `mediaBlobs` (keyPath `driveId`), `streakLog` (keyPath `date`). v2: `playback` (keyPath
  `driveId`, index `updatedAt`). For schema changes, bump `DB_VERSION` and add an `if (oldVersion < N)` block.
  Never edit an earlier block.
  - `blocking` closes the connection when another context deletes or upgrades the DB (e.g. a tab on a newer
    version), and `terminated` handles abnormal closes. Both reset the promise so the next access reopens.
    Without the `blocking` handler, `deleteDB` / upgrades hang while any connection is open.
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
  - `revision` signal bumps on every `driveCache` write (sync, clear, `setDuration`). UI that reads the cache
    should key its `resource()` params on it.
  - `setDuration(id, ms)` records a duration learned during playback. Sync carries learned durations over
    for files whose `modifiedTime` hasn't changed.
  - `getTrail(id)` returns the folders from just below the root down to `id` (for breadcrumbs).
    `getDescendantSessions(folderId)` returns every session beneath a folder, depth-first (for "Download all").
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
- **`shared/session-list`**: rows with a play button, cleaned title, "Audio"/"Video · 12 min" and a trailing
  `app-download-button`. Emits `(sessionSelect)` with the `DriveNode`. Rows are plain `<button>`s, not
  `ion-item button`, so the download button isn't nested inside another button.
- **`shared/display.ts`**:
  - `displayName()` strips the file extension, leading track numbers like "01 - ", and underscores. Never
    show raw Drive names in the UI.
  - `formatDuration()` and `sessionCountLabel()` format durations and "N sessions" labels.
  - `categoryAppearance()` picks an icon from keywords in the name (sleep→moon, focus→bulb, …) and a
    gradient from a hash of the id, so a category looks the same everywhere.
- Tapping a session calls `PlayerLauncher.open(session)` (Phase 3).

## 10. Player (Phase 3, as built)

- **`core/drive-api.service.ts` `downloadMedia(id, { signal, expectedBytes, onProgress })`**: fetches `alt=media`
  with the auth header and reads the body stream to report progress (from Content-Length, falling back to
  `sizeBytes`). Shares the 401-retry / backoff logic with the metadata calls (`request()`).
- **`core/media-source.service.ts` `resolve(node)`** returns `{ url, source: 'download' | 'stream', release() }`.
  - A `mediaBlobs` copy always wins, so offline playback already works once Phase 4 stores blobs.
  - Otherwise it fetches the file and wraps it in an object URL, fixing the MIME type if Drive sends a generic one.
  - The last streamed file stays in memory, so reopening the same session doesn't download it again.
  - **Limitation:** the whole file downloads before playback starts (Drive `alt=media` needs a header, so
    `<audio src>` can't stream it directly). That's fine for typical sessions; long videos take a while.
    Options if it becomes a problem: MediaSource with Range requests, or download first (Phase 4).
- **`core/playback.service.ts`**:
  - `resumePosition(id)` returns 0 if the session is new, under 5 s in, or within 10 s of the end / completed.
  - `save()` marks a session completed when it's within 10 s of the end.
  - `recent(limit)` returns sessions newest first. Phase 5's "Continue listening" should use it.
- **`player/player-launcher.service.ts` `open(session)`** works out the folder path and category look from
  `getTrail`, then opens `PlayerComponent` as a full-screen modal (`md-player-modal`). Only one player is
  open at a time.
- **`player/player.component.*`**:
  - Inputs are Angular signal inputs, set through `provideIonicAngular({ useSetInputAPI: true })` in `main.ts`.
    Don't name a property `modal` (reserved by Ionic).
  - States: loading (shows download progress), error (retry; `AuthRequiredError` → "Reconnect Google Drive…"),
    and ready.
  - Audio shows a breathing orb in the category's colours; video shows a `<video playsinline>` with a fullscreen button.
  - Controls: scrubber (`ion-range`; while dragging it ignores `timeupdate`), ±15 s skip, play/pause, and a
    "Picked up at m:ss · Start over" chip.
  - Autoplays once metadata loads; if the browser blocks autoplay, the play button is shown.
  - Position is saved every 5 s while playing, and on pause, seek, end (completed) and close.
  - Learned durations are saved with `library.setDuration`.
  - Media Session API provides lock-screen / headset metadata and play/pause/seek actions, cleared on close.
  - Closing the player stops playback. There's no mini-player / background playback yet; candidate for Phase 6.
  - The first `onPlay()` of each player instance calls `StreakService.recordSessionStart()`, so
    pause/resume doesn't count twice.
  - Top bar has `app-download-button variant="light"`. Playback errors from `TypeError` / `!navigator.onLine`
    show "You're offline. Download sessions ahead of time…".
- Component style budget raised to 6 kB warn / 10 kB error (`angular.json`) for the player stylesheet.

## 11. Downloads (Phase 4, as built)

- **`core/downloads.service.ts`** is the single source of truth for downloads.
  - Signals:
    - `ids` — Drive IDs with a stored copy.
    - `active` / `activeList` — queued and in-flight downloads, with `progress` from 0–1, or null while queued.
    - `revision` — bumps on any `mediaBlobs` change.
    - `lastError` — failures only; cancellations aren't reported.
  - Actions: `download(node)`, `downloadAll(nodes)` (skips ones already stored or queued, returns how many
    were added), `cancel(id)`, `remove(id)`, `removeAll()`, `list()` (sorted by folder path, then title),
    `storageInfo()` (download bytes plus `navigator.storage.estimate()` / `persisted()`).
  - Queue runs 2 downloads at a time. If `MediaSourceService.peekStreamed(id)` still holds a just-played
    file, it's saved from memory with no second fetch.
  - Each record stores `folderPath`, `parentId`, `durationMs`, `sizeBytes`.
  - Calls `navigator.storage.persist()` once per session after the first successful download.
  - Error messages: `AuthRequiredError` → reconnect; `QuotaExceededError` → out of space; network → check connection.
- **`AppComponent`** shows `downloads.lastError` as a toast, since downloads run in the background.
- **`shared/download-button`** is the per-session toggle: download icon → progress ring (tap = cancel) →
  checkmark (tap = confirm, then remove). `variant="light"` is for the player. Clicks don't propagate.
- **Category page** hero pill: "Download all" (confirm shows count and approximate size from `sizeBytes`),
  then "Downloading · N left", then "Available offline". It covers every session beneath the category,
  including sub-collections.
- **Downloads tab** (`pages/downloads/`):
  - In-progress list with a cancel button for each.
  - Storage card: count, size, a device usage bar, and a warning when storage isn't persisted.
  - Downloads grouped by `folderPath`; tapping plays them. The player gets the cached node, or one built from
    the download if the cache no longer has it (`PlayerLauncher.open(node, fallbackFolderPath)`).
  - A trash button per item, and "Remove all" with a confirm.
  - Empty state links to Explore.
- **Settings**: "Clear downloads" shows the session count and asks to confirm.
- Playing offline: `MediaSourceService` already prefers `mediaBlobs`. The last streamed file also stays in
  memory, so it keeps playing offline until the app reloads.
- Layering note: `DownloadsService` imports `displayName` from `shared/display.ts`, a pure helper and the only
  core → shared import.

## 12. Streak & Home (Phase 5, as built)

- **`core/streak.ts`** (pure functions, unit-tested):
  - `localDateKey(date)` gives 'YYYY-MM-DD' in local time.
  - `computeStreaks(keys, today)` returns `{ current, longest, practicedToday }`. The current streak counts
    back from today, or from yesterday if today has no entry yet. Day maths goes through `Date.UTC`
    day numbers, so daylight-saving changes are safe.
  - `buildHeatmap(entries, today, weeks = 12)` returns week columns, Sunday first, the last being the
    current week. Each cell has a `level` from 0–4 (1, 2, 3, 4+ sessions) and a `future` flag. A column
    gets a month label when it contains the 1st–7th of a month.
- **`core/streak.service.ts`**: `recordSessionStart(at)` increments `sessionsPlayed` for that local day in one
  transaction. `entries()`, plus a `revision` signal.
- **`PlaybackService.revision`** bumps on every save, and Home keys on it. Saves happen every 5 s during
  playback, so Home re-reads a handful of IndexedDB rows while the player is open. That's cheap; revisit if not.
- **Home** (`pages/home/`):
  - Greeting large title (morning 5–12, afternoon 12–17, evening otherwise).
  - `streak-card`: flame + current streak (the flame lights up once today counts), longest streak, a
    contextual message, and the heatmap. The heatmap is `role="img"` with a summary label; cells have
    hover titles.
  - "Continue listening": the most recent `playback` entry that isn't completed and has `positionSec > 0`.
    Shows a progress bar and "N min left"; tapping opens the player, which resumes.
  - "Your categories": up to 4 top-level categories. Ones you played recently come first (ranked by the
    first-level folder in `getTrail` of the last 20 plays); the rest follow library order.
  - Welcome empty state when there's no library and no history.
  - `now` refreshes on `ionViewWillEnter` and `visibilitychange`, so the date rolls over when the app is
    reopened the next day.

## 13. Polish (Phase 6, as built)

- **Icons**:
  - SVG masters live in `design/icons/`: `icon.svg` (rounded square, transparent corners), `icon-maskable.svg`
    (full bleed, artwork within the 80% safe zone), `icon-apple.svg` (full bleed; iOS rounds it) and
    `favicon.svg` (thicker artwork for small sizes).
  - `scripts/render-icons.mjs` renders them into `public/icons/` with Playwright + Chrome; setup is described
    at the top of the file.
  - Output: `icon-{72…512}.png` (any), `maskable-{192,512}.png`, `apple-touch-icon.png` (180),
    `favicon-32x32.png` and `favicon.svg`.
- **Manifest**: separate `any` and `maskable` icon entries (never the combined "maskable any"), plus `id`,
  `lang`, `categories`, and `shortcuts` to Explore and Downloads.
- **`index.html`**: SVG + PNG favicons, apple-touch-icon, theme-color for light and dark, preconnect to
  accounts.google.com and googleapis.com, an inline background colour so dark mode doesn't flash white,
  and a styled `<noscript>`.
- **Service worker** (`ngsw-config.json`):
  - `app-shell` prefetches `index.html`, the manifest and all JS/CSS, including the lazy chunks. A full
    reload while offline works (checked).
  - `icons` prefetches the few icons the shell uses; other images load lazily.
  - `navigationRequestStrategy: performance`. There are no `dataGroups`; nothing from Google is cached by the SW.
  - **Bypass:** `DriveApiService` adds `ngsw-bypass=true` to Drive requests so large media doesn't go through
    the SW. The `ngsw-bypass` *header* can't be used: googleapis.com's CORS preflight rejects it (403). If
    Drive ever answers 400, the parameter is dropped for the rest of the session.
  - **Updates:** `core/app-update.service.ts` (started from `AppComponent`) shows a "new version is ready —
    Reload / Later" toast on `VERSION_READY`, forces a reload on `unrecoverable`, and checks hourly.
- **Status and errors**:
  - `core/network.service.ts` provides an `online` signal from navigator.onLine and its events.
  - `shared/library-banner` sits at the top of Explore and Category and shows the most important of:
    offline, needs reconnect (with a one-tap Reconnect), or last refresh failed (Retry).
  - While offline, session rows that can't play are dimmed and their download button is hidden.
  - `shared/load-error` is shown by Home, Explore, Category and Downloads when their `resource()` fails
    (IndexedDB unavailable, e.g. some private modes), with a Try again button that calls `resource.reload()`.
- **Accessibility**: light-theme text colours now meet WCAG AA 4.5:1:
  - primary `#b8562d` (terracotta; white text on it 4.8:1)
  - medium `#6e6880`
  - secondary `#4d7a69`
  - danger `#c0392b`
  - inactive tab labels use medium
  Decorative gradients keep the lighter apricot tones.
- **Responsive**:
  - Wide screens use `width: min(880px, 100% - 32px)` (640px for Settings), so there's always a 16px gutter.
  - From 768px up, the streak card puts the numbers left and the heatmap right; heatmap cells are capped
    via `max-width: 440px`.
  - Landscape phones (max-height 540px) get a two-column player: artwork left, title and controls right.
- **README.md** covers Google Cloud setup, commands, deployment (HTTPS, SPA fallback to index.html, root base
  href, add the production origin to the OAuth client) and icon regeneration.

### Ideas beyond the spec (not built)
- Mini-player / background playback when the player is closed.
- Stream long videos with MediaSource + Range requests instead of downloading the whole file first.
- Background download of a whole category via Background Fetch (Chromium only).

## 14. GitHub Pages deployment

- `.github/workflows/deploy-pages.yml` runs on push to `main` or manually: `npm ci` → lint → test →
  `npm run build:pages` → `actions/upload-pages-artifact` (`www/`) → `actions/deploy-pages`. The repo's
  Pages source must be set to **GitHub Actions**.
- `scripts/build-pages.mjs` picks the base href from, in order: `--base-href=`, then `PAGES_BASE_HREF`
  (repo variable; use `/` for a custom domain), then `GITHUB_REPOSITORY` (`/<repo>/`, or `/` for
  `<user>.github.io` repos). After `ng build` it copies `www/index.html` → `www/404.html` as the SPA fallback.
- **Subpath rules** (the app is served from `/<repo>/`):
  - Never hard-code root-absolute URLs in markup (`href="/…"`, `src="/…"`).
  - Router links (`routerLink="/tabs/…"`, `navigateBack('/tabs/…')`, `redirectTo`) are fine; the
    router resolves them against `<base href>`.
  - `ion-tab-button` uses relative `href="tabs/<name>"`. Ionic navigates by the `tab` attribute; the href
    only renders the inner anchor, and the anchor needs an href to stay focusable. With no href, keyboard
    access breaks; with a root-absolute one, "open in new tab" escapes the subpath.
  - Asset URLs in TS (e.g. Media Session artwork `icons/…`) are relative and resolve against `<base href>`.
  - Manifest `start_url`/`scope`/`id`/shortcuts are `./…`, so they're relative to the manifest. ngsw.json
    and the service-worker scope follow the base href automatically.
- Checked with a local Pages emulation (build under `/MindDrive/`, no rewrites, root `404.html`). All of these
  worked: cold deep link via `404.html`, tab navigation and keyboard, SW scope `/MindDrive/`, manifest with
  no errors, and an offline deep link served by the SW.
- OAuth: add the site's origin only (no path) to the client's Authorized JavaScript origins. For this
  project the user site `ttruty.github.io` has the custom domain `timtruty.com`, so the app is served at
  `https://timtruty.com/MindDrive/` and the origin is `https://timtruty.com`.
- **Tests share one environment**: Angular's Vitest runner defaults to `isolate: false`, so every spec file
  shares the same jsdom, localStorage and fake IndexedDB, and file order varies (CI has no timing cache).
  Specs that use IndexedDB should `deleteDB` in `beforeEach` and close the connection in `afterEach`.
  `DbService`'s `blocking` handler keeps a leaked connection from hanging other files (that was the
  first CI failure).

## 15. Favorites & install prompt (post-spec features)

### Favorites
- **Storage:** the `favorites` store (DB v3) holds `FavoriteEntry { driveId, name, mimeType, parentId,
  folderPath, durationMs?, addedAt }`. Each entry carries enough to render and play offline, even after
  a library cache clear.
- **`core/favorites.service.ts`:**
  - Signals: `ids` (Set) and `revision`.
  - Actions: `toggle(node)`, `add`, `remove`, `list()` (newest first), and `listAsNodes()`, which prefers
    the cached `DriveNode` and falls back to the entry.
  - Changes wait for the startup load (`ready`), so a quick first tap can't be overwritten by it.
- **`shared/favorite-button`:** heart toggle with `aria-pressed`, a pop animation, and `variant="light"`
  for the player. It sits in every session row (before the download button) and in the player's top bar.
- **Home** has a "Favorites" section: the 3 newest, plus "See all" → `/tabs/home/favorites`
  (`pages/favorites/`, stacked in the Home tab, with an empty state). It uses its own `resource()`, so
  toggling a heart doesn't recompute streaks.

### Install prompt
- **`core/install-prompt.service.ts`:**
  - `platform` is ios, android or other; iPadOS reporting as a Mac is caught via `maxTouchPoints`.
  - `isMobile` covers phones and tablets.
  - `installed` means display-mode standalone, `navigator.standalone`, or a remembered `appinstalled` /
    accepted prompt.
  - `method()` is `'native'` once Chromium fires `beforeinstallprompt` (captured with `preventDefault` to
    hide Chrome's mini-infobar), `'ios-manual'` on iOS, otherwise `null`.
  - `shouldOfferOnLaunch()`: mobile, a method is available, and not snoozed. "Not now" / "Got it"
    snooze it for 7 days (`md.install.snoozedUntil`).
- **`install/install-launcher.service.ts`:**
  - `offerOnLaunch()` (from `AppComponent`) waits 2.5 s, then shows the sheet once per launch.
  - If `beforeinstallprompt` arrives in the first 60 s, it's offered then.
  - Never shown over the player.
  - `show()` opens it on demand from Settings → App → "Install MindDrive"; that item only appears when
    install is possible.
- **`install/install-sheet.component`:** auto-height bottom sheet (`md-install-sheet` in global.scss) with the
  icon, three benefits, and either **Install** (native prompt) or iOS steps. The Share button is described
  as "in the address bar" for Chrome on iOS (`CriOS`).
- **Not covered:** Firefox Android and other browsers without `beforeinstallprompt` get no prompt, rather
  than nagging people who may already have it installed. There's no reliable way to detect an existing
  install from a browser tab.
