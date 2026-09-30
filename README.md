# MindDrive

A calm, Headspace-style meditation app for your own audio and video. Your Google Drive folder is the
library: folders become categories, files become sessions. It's an installable PWA with offline
downloads and a daily streak. There's no backend; everything lives in your browser.

## Setup

1. In Google Cloud Console, create a project and **enable the Google Drive API**.
2. Configure the OAuth consent screen (External; while in Testing, add your account as a test user).
   The only scope is `https://www.googleapis.com/auth/drive.readonly`.
3. Create an **OAuth client ID** of type *Web application*. Add every origin you'll run from as an
   *Authorized JavaScript origin* (e.g. `http://localhost:8100` and your production URL).
4. Put the client ID in `src/environments/environment.ts` and `environment.prod.ts` (`googleClientId`).
   It isn't a secret.
5. *(Optional — shared links without sign-in)* Create an **API key** (Credentials → Create credentials →
   API key). Restrict it: **API restrictions** → Google Drive API only; **Application restrictions** →
   Websites, with `http://localhost:8100/*` and your site (e.g. `https://timtruty.com/*`). Put it in
   `googleApiKey` in both environment files. The key ships in the site's JavaScript — the restrictions
   are what keep it from being used elsewhere.

With the API key set, anyone can paste a folder link shared as **“Anyone with the link”** into
Settings → Library and listen without signing in. Private folders still need **Connect Google Drive**.

```bash
npm install
npm start          # dev server on http://localhost:8100 (service worker off)
npm run preview    # production build served on :8100 with the service worker on
npm test           # unit tests (Vitest)
npm run lint
```

In the app: **Settings → Connect Google Drive**, then paste your meditation folder's link (or browse to it).

## Deploying to GitHub Pages

A workflow (`.github/workflows/deploy-pages.yml`) lints, tests, builds and deploys on every push to `main`.

1. Push this repo to GitHub (e.g. `github.com/<you>/MindDrive`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. In Google Cloud → your OAuth client → **Authorized JavaScript origins**, add `https://<you>.github.io`
   (origin only — no `/MindDrive` path).
4. Push to `main` (or run the workflow by hand from the Actions tab). The app is published at
   `https://<you>.github.io/<repo>/`.

How it works: `npm run build:pages` builds with `--base-href /<repo>/` (taken from the repo name in CI)
and copies `index.html` to `404.html`. Pages has no SPA rewrites, so deep links like
`/<repo>/tabs/explore` are served by `404.html` (HTTP 404 status, but the app loads normally); once
installed, the service worker serves them from cache.

- **Your user site has a custom domain** (e.g. `ttruty.github.io` → `timtruty.com`): project sites inherit it,
  so the app lives at `https://timtruty.com/MindDrive/`. The base href stays `/MindDrive/`; the OAuth origin
  to add is `https://timtruty.com`. Make sure **Enforce HTTPS** is on — service workers and Google sign-in
  need HTTPS.
- **Custom domain on this repo itself** (served at `/`): set the repository variable `PAGES_BASE_HREF` to `/`
  (Settings → Secrets and variables → Actions → Variables), and add that domain as an OAuth origin.
- **Build locally for Pages**: `npm run build:pages -- --base-href=/MindDrive/` → `www/`.
- Pages sites are public even from a private repo (which needs a paid plan). Nobody can see your library
  without signing in with your Google account, and while the OAuth consent screen is in *Testing*, only
  listed test users can sign in at all.

Other static hosts work too: serve `www/` over HTTPS with a fallback to `index.html` for unknown paths,
building with the base href that matches where it's hosted.

## Icons

SVG masters are in `design/icons/`. After editing them, re-render the PNGs in `public/icons/`
with `scripts/render-icons.mjs` (see the comment at the top for how to point it at Playwright).

See `CLAUDE.md` for the full spec and architecture notes.
