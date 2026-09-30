// Renders the SVG masters in design/icons/ into the PNGs the PWA manifest and index.html use.
// Needs Playwright + a Chromium, which aren't project dependencies. Install them anywhere and point at it:
//   npm i --prefix /tmp/pw playwright && npx --prefix /tmp/pw playwright install chromium
//   PLAYWRIGHT=/tmp/pw/node_modules/playwright/index.mjs node scripts/render-icons.mjs
import { copyFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(
  process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright'
);

const SRC = new URL('../design/icons/', import.meta.url);
const OUT = new URL('../public/icons/', import.meta.url);

const jobs = [
  ...[72, 96, 128, 144, 152, 192, 384, 512].map((size) => ({ src: 'icon.svg', out: `icon-${size}x${size}.png`, size })),
  ...[192, 512].map((size) => ({ src: 'icon-maskable.svg', out: `maskable-${size}x${size}.png`, size })),
  { src: 'icon-apple.svg', out: 'apple-touch-icon.png', size: 180 },
  { src: 'favicon.svg', out: 'favicon-32x32.png', size: 32 },
];

// Prefer an installed Google Chrome; fall back to Playwright's bundled Chromium.
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage();
for (const { src, out, size } of jobs) {
  const svg = (await readFile(new URL(src, SRC), 'utf8')).replace(/width="512" height="512"/, `width="${size}" height="${size}"`);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: new URL(out, OUT).pathname, omitBackground: true });
  console.log('wrote', out);
}
await browser.close();
await copyFile(new URL('favicon.svg', SRC), new URL('favicon.svg', OUT));
console.log('copied favicon.svg');
