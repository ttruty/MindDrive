// Production build for GitHub Pages.
//
// Base href, first match wins:
//   1. --base-href=/path/           e.g. node scripts/build-pages.mjs --base-href=/MindDrive/
//   2. PAGES_BASE_HREF env var      e.g. "/" for a custom domain
//   3. GITHUB_REPOSITORY (set by Actions): "/<repo>/", or "/" for a <user>.github.io repo
//
// GitHub Pages can't rewrite unknown paths to index.html, so deep links like /MindDrive/tabs/explore
// would 404. Pages serves 404.html for those instead, so we ship a copy of index.html under that name
// and the Angular router takes it from there. (Once installed, the service worker serves navigations.)
import { execFileSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';

const OUT = 'www';

function resolveBaseHref() {
  const arg = process.argv.find((a) => a.startsWith('--base-href='))?.slice('--base-href='.length);
  if (arg) return arg;
  if (process.env.PAGES_BASE_HREF) return process.env.PAGES_BASE_HREF;
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (repo) return repo.toLowerCase().endsWith('.github.io') ? '/' : `/${repo}/`;
  console.error('Set a base href: --base-href=/<repo>/ (or PAGES_BASE_HREF, or run in GitHub Actions).');
  process.exit(1);
}

const base = `/${resolveBaseHref().replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
console.log(`Building for GitHub Pages with base href ${base}`);

execFileSync('npx', ['ng', 'build', '--base-href', base], { stdio: 'inherit' });
copyFileSync(`${OUT}/index.html`, `${OUT}/404.html`);
console.log(`Wrote ${OUT}/404.html (SPA fallback)`);
