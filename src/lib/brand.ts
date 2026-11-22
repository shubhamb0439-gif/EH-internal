// Event Horizon brand geometry, shared by the React <Logo/> and scripts/build-logos.mjs.
// Pure vector: the wordmark is drawn as monoline strokes so it never depends on a font.
// Keep this file free of TS-only syntax beyond type annotations (Node strips them when the script runs).

/** Mark: two crescents cut by a horizon line. viewBox 0 0 184 120, circle centre (95,60) r 50. */
export const MARK_VIEWBOX = { x: 0, y: 0, w: 184, h: 120 };

export const MARK_PATHS = {
  top: 'M45.49 53.04 A50 50 0 0 1 144.51 53.04 A54.25 54.25 0 0 0 45.49 53.04 Z',
  bottom: 'M45.49 66.96 A50 50 0 0 0 144.51 66.96 A53 53 0 0 1 45.49 66.96 Z',
  bottomTransform: 'rotate(14 95 60)',
  horizon: 'M2 60.4 Q70 56.2 182 60 Q70 62.6 2 60.4 Z',
};

// Wordmark letters, cap height 40, stroke 4.6, drawn on stroke centres.
const S = 2.3;
const LETTERS: Record<string, { w: number; d?: string; circle?: [number, number, number] }> = {
  E: { w: 26, d: `M26 ${S} H${S} V${40 - S} H26 M${S} 20 H23.5` },
  V: { w: 34, d: 'M0.8 0 L17 35.4 L33.2 0' },
  N: { w: 31, d: `M${S} 40 V4.4 L${31 - S} 35.6 V0` },
  T: { w: 30, d: `M0 ${S} H30 M15 ${S} V40` },
  H: { w: 31, d: `M${S} 0 V40 M${31 - S} 0 V40 M${S} 20 H${31 - S}` },
  O: { w: 42, circle: [21, 20, 20 - S] },
  R: { w: 29, d: `M${S} 40 V${S} H16.6 A9.7 9.7 0 0 1 16.6 21.7 H${S} M14.6 21.7 L28 40` },
  I: { w: 4.6, d: `M${S} 0 V40` },
  Z: { w: 29, d: `M1.5 ${S} H27 L2 ${40 - S} H28.5` },
};

export const WORD_STROKE = 4.6;

/** Lays out "EVENT HORIZON" and returns svg inner markup (strokes use currentColor-like `color`). */
export function wordmarkMarkup(color: string, opts: { x?: number; y?: number; scale?: number; tracking?: number } = {}) {
  const { x = 0, y = 0, scale = 1, tracking = 19 } = opts;
  const text = 'EVENT HORIZON';
  let cx = 0;
  const parts: string[] = [];
  for (const ch of text) {
    if (ch === ' ') { cx += 26; continue; }
    const L = LETTERS[ch];
    if (L.circle) {
      const [a, b, r] = L.circle;
      parts.push(`<circle cx="${(cx + a).toFixed(2)}" cy="${b}" r="${r}"/>`);
    } else {
      parts.push(`<path transform="translate(${cx.toFixed(2)} 0)" d="${L.d}"/>`);
    }
    cx += L.w + tracking;
  }
  const width = cx - tracking;
  const g = `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="${WORD_STROKE}" stroke-linejoin="miter" stroke-miterlimit="2.2" stroke-linecap="butt">${parts.join('')}</g>`;
  return { markup: g, width: width * scale, height: 40 * scale };
}

export function markMarkup(color: string) {
  return `<g fill="${color}"><path d="${MARK_PATHS.top}"/><path d="${MARK_PATHS.bottom}" transform="${MARK_PATHS.bottomTransform}"/><path d="${MARK_PATHS.horizon}"/></g>`;
}

/** Full horizontal lockup: mark + wordmark, letters centred on the horizon line. */
export function lockupSvg(color: string, background?: string) {
  const scale = 0.68;
  const word = wordmarkMarkup(color, { x: 196, y: 60 - (40 * scale) / 2, scale });
  const w = Math.ceil(196 + word.width + 4);
  const h = MARK_VIEWBOX.h;
  const bg = background ? `<rect width="100%" height="100%" fill="${background}"/>` : '';
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Event Horizon">${bg}${markMarkup(color)}${word.markup}</svg>`,
    width: w,
    height: h,
  };
}

export function markSvg(color: string, background?: string, pad = 0) {
  const { w, h } = MARK_VIEWBOX;
  const vb = `${-pad} ${-pad - (w - h) / 2} ${w + pad * 2} ${w + pad * 2}`; // square canvas
  const bg = background ? `<rect x="${-pad}" y="${-pad - (w - h) / 2}" width="${w + pad * 2}" height="${w + pad * 2}" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="Event Horizon">${bg}${markMarkup(color)}</svg>`;
}
