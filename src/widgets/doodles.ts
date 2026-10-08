// The landing page's doodle wallpaper (Web/public/landing/doodles-*.svg), cut
// down for a widget card: the same six glyphs, hand-placed so none lands
// under the hero number, drawn in the text color at a whisper of opacity.
//
// Glyph coordinates are in a 100x100 box; `place` scales each one onto the
// card so a wide card and a square one share the same set.
import type { ThemeTokens } from "@/src/theme/tokens";

const GLYPH = {
  star: "M 50 22 L 57 42 L 78 43 L 61 56 L 67 77 L 50 65 L 33 77 L 39 56 L 22 43 L 43 42 Z",
  arc: "M 30 70 Q 50 20 70 70",
  triangle: "M 50 26 L 74 70 L 26 70 Z",
  ring: "M 50 50 m -16 0 a 16 16 0 1 0 32 0 a 16 16 0 1 0 -32 0",
  zigzag: "M 12 60 L 30 40 L 48 60 L 66 40 L 84 60",
  wave: "M 10 50 Q 25 30 40 50 T 70 50 T 95 50",
  stripes: "M 30 30 L 70 70 M 45 22 L 85 62 M 15 45 L 55 85",
} as const;

type Spot = { glyph: keyof typeof GLYPH; x: number; y: number; size: number; rotate: number };

/** Positions as a fraction of the card, size in dp. The mini card has the
 *  bird top-left, the + top-right and the number across the bottom, so the
 *  glyphs sit in the gaps: between bird and +, down the right edge, and in
 *  the strip between the bird's feet and the number. */
const SQUARE: Spot[] = [
  { glyph: "star", x: 0.6, y: 0.1, size: 18, rotate: -14 },
  { glyph: "arc", x: 0.7, y: 0.42, size: 18, rotate: 32 },
  { glyph: "ring", x: 0.92, y: 0.6, size: 16, rotate: 0 },
  { glyph: "triangle", x: 0.3, y: 0.62, size: 14, rotate: -28 },
  { glyph: "wave", x: 0.88, y: 0.9, size: 22, rotate: -8 },
  { glyph: "stripes", x: 0.55, y: 0.6, size: 14, rotate: 0 },
];

/** The large widget's header band: bird top-left, ring + number top-right,
 *  pills along the bottom right. */
const WIDE: Spot[] = [
  { glyph: "star", x: 0.93, y: 0.12, size: 20, rotate: -14 },
  { glyph: "arc", x: 0.34, y: 0.56, size: 18, rotate: 32 },
  { glyph: "ring", x: 0.97, y: 0.48, size: 14, rotate: 0 },
  { glyph: "triangle", x: 0.1, y: 0.9, size: 14, rotate: -28 },
  { glyph: "zigzag", x: 0.28, y: 0.92, size: 20, rotate: 12 },
  { glyph: "stripes", x: 0.34, y: 0.08, size: 14, rotate: 0 },
];

export function doodlesSvg(
  width: number,
  height: number,
  tokens: ThemeTokens,
  scheme: "light" | "dark",
): string {
  const spots = width > height * 1.4 ? WIDE : SQUARE;
  // Dark surfaces swallow a hairline; light ones show it at half the strength.
  const opacity = scheme === "dark" ? 0.2 : 0.14;
  const glyphs = spots
    .map(({ glyph, x, y, size, rotate }) => {
      const s = size / 100;
      return `<path d="${GLYPH[glyph]}" transform="translate(${(x * width).toFixed(1)} ${(y * height).toFixed(1)}) rotate(${rotate}) scale(${s.toFixed(3)}) translate(-50 -50)"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none" stroke="${tokens.text}" stroke-opacity="${opacity}" stroke-width="${(2.4 / 0.2).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round">${glyphs}</svg>`;
}
