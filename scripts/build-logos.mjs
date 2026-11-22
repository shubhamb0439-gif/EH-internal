// Generates every logo asset into public/brand from src/lib/brand.ts.
// Run: npm run logos   (Node 22.6+ strips the TypeScript types on import)
import { writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { lockupSvg, markSvg } from '../src/lib/brand.ts';

const out = new URL('../public/brand/', import.meta.url);
mkdirSync(out, { recursive: true });
const write = (name, data) => writeFileSync(new URL(name, out), data);
const png = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();

for (const [tone, color] of [['black', '#0A0A0A'], ['white', '#FFFFFF']]) {
  const lock = lockupSvg(color).svg;
  write(`eh-logo-${tone}.svg`, lock);
  write(`eh-logo-${tone}.png`, png(lock, 2400));
  const mark = markSvg(color, undefined, 6);
  write(`eh-mark-${tone}.svg`, mark);
  write(`eh-mark-${tone}.png`, png(mark, 1024));
}

// App icons: white mark on near-black, padded for maskable safe zone.
const icon = markSvg('#F5F5F4', '#0A0A0A', 46);
write('icon.svg', icon);
for (const size of [192, 512]) write(`icon-${size}.png`, png(icon, size));
write('apple-touch-icon.png', png(icon, 180));
write('favicon.svg', markSvg('#0A0A0A', '#FFFFFF', 18));
write('favicon-32.png', png(markSvg('#0A0A0A', '#FFFFFF', 18), 32));
console.log('brand assets written to public/brand');
