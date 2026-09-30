import { DriveNode } from '../core/models';

/**
 * Human-friendly title for a node: drops the file extension, a leading track number
 * ("01 - ", "2. ", "03_"), and underscores. "3 Minute Breathing" keeps its number because
 * there's no separator after it.
 */
export function displayName(node: Pick<DriveNode, 'name' | 'isFolder'>): string {
  let name = node.name;
  if (!node.isFolder) name = name.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const cleaned = name
    .replace(/^\d{1,3}\s*[-._)]\s*/, '')
    .replace(/_/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || node.name;
}

/** "45 sec", "12 min", "1 hr 5 min". */
export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} sec`;
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min ? `${hr} hr ${min} min` : `${hr} hr`;
}

export function sessionCountLabel(count: number | undefined): string {
  if (count === undefined) return '';
  return count === 1 ? '1 session' : `${count} sessions`;
}

export interface CategoryAppearance {
  icon: string;
  /** CSS background (gradient) for the card. */
  background: string;
}

// Keyword → ionicon. First match on the lower-cased name wins.
const ICON_RULES: [RegExp, string][] = [
  [/sleep|night|dream|rest|bed/, 'moon'],
  [/focus|study|work|concentrat/, 'bulb'],
  [/breath|pranayama/, 'leaf'],
  [/anxi|stress|calm|panic|worry/, 'water'],
  [/morning|wake|energ|sun/, 'sunny'],
  [/walk|move|yoga|stretch|body|scan/, 'walk'],
  [/kid|child|family/, 'happy'],
  [/music|sound|song|noise|ambien/, 'musical-notes'],
  [/love|kind|compassion|metta|gratitude|heart/, 'heart'],
  [/nature|forest|rain|ocean|sea/, 'rainy'],
  [/course|basic|begin|intro|learn|101/, 'school'],
  [/pain|heal|recover/, 'bandage'],
];
const FALLBACK_ICONS = ['sparkles', 'flower', 'planet', 'star', 'cloud', 'infinite'];

// Soft two-stop gradients that sit well on both the light and dark themes.
const GRADIENTS = [
  ['#f6b38e', '#e07a4f'], // apricot
  ['#9fc7b4', '#5e8c7a'], // sage
  ['#bfb6f0', '#8b7fd1'], // lavender
  ['#9cc6e8', '#5b8fc4'], // sky
  ['#f2a7b8', '#c9658f'], // rose
  ['#f1d08a', '#d9a441'], // sand
];

/** Deterministic icon + colour for a category so it looks the same on every visit. */
export function categoryAppearance(node: Pick<DriveNode, 'id' | 'name'>): CategoryAppearance {
  const name = node.name.toLowerCase();
  const hash = hashString(node.id);
  const icon =
    ICON_RULES.find(([re]) => re.test(name))?.[1] ?? FALLBACK_ICONS[hash % FALLBACK_ICONS.length];
  const [from, to] = GRADIENTS[hash % GRADIENTS.length];
  return { icon, background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` };
}

/** FNV-1a with a murmur-style finaliser, so similar IDs still land on different colours. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Player clock: "4:05", or "1:02:09" past an hour. */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(Number.isFinite(totalSec) ? totalSec : 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "850 KB", "12.4 MB", "1.2 GB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
