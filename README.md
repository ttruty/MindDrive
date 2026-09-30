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

```bash
npm install
npm start          # dev server on http://localhost:8100 (service worker off)
npm run preview    # production build served on :8100 with the service worker on
npm test           # unit tests (Vitest)
npm run lint
```

In the app: **Settings → Connect Google Drive**, then paste your meditation folder's link (or browse to it).

## Deploying

`npm run build` outputs a static site to `www/`. Host it anywhere that serves HTTPS and falls back to
`index.html` for unknown paths (SPA routing). The app assumes it's served from the site root (`<base href="/">`).
Remember to add the production origin to the OAuth client.

## Icons

SVG masters are in `design/icons/`. After editing them, re-render the PNGs in `public/icons/`
with `scripts/render-icons.mjs` (see the comment at the top for how to point it at Playwright).

See `CLAUDE.md` for the full spec and architecture notes.
