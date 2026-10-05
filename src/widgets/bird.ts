// The widgets' mascot: the Aviary bird inside a ring showing how much of the
// month's budget is left. The mood changes between updates; between those,
// birdRingFrames loops a blink (see the patched SvgWidget `frames` prop).
//
// SvgWidget goes through AndroidSVG, not a browser: only literal hex colors
// with separate opacity attributes here, never rgba() or CSS variables.
import { BIRD_BODY_PATH, BIRD_EYE } from "@/src/components/splash/birdPath";
import type { ThemeTokens } from "@/src/theme/tokens";
import type { WidgetMood } from "./data";

/** The card's surface color as a solid hex, for the eye. Matches surface.tsx's
 *  near-opaque fills, so the eye reads as a hole punched through the bird
 *  just like the app's own mark (BIRD_PATH, fillRule evenodd). */
const EYE = { light: "#fcfcfc", dark: "#0a0a0a" } as const;
const BLUSH = "#ffb199";

export function moodColor(mood: WidgetMood, tokens: ThemeTokens): string {
  switch (mood) {
    case "ok":
      return tokens.mint;
    case "tight":
      return tokens.warn;
    case "over":
      return tokens.coral;
    case "stale":
      return tokens.text3;
  }
}

/** The bird alone, in its own 512-unit artboard. */
function birdBody(
  mood: WidgetMood,
  tokens: ThemeTokens,
  scheme: "light" | "dark",
  blink = false,
): string {
  const body = tokens.accent;
  const eye = EYE[scheme];
  const { cx, cy, r } = BIRD_EYE;

  let face: string;
  if (mood === "stale" || blink) {
    // Eye shut: a sleepy arc instead of the open eye.
    face = `<path d="M ${cx - 16} ${cy + 4} Q ${cx} ${cy + 18} ${cx + 16} ${cy + 4}" fill="none" stroke="${eye}" stroke-width="9" stroke-linecap="round"/>`;
  } else {
    face = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${eye}"/>`;
    if (mood === "ok") face += `<circle cx="${cx + 6}" cy="${cy - 6}" r="6" fill="${body}"/>`;
    if (mood === "tight") face += `<circle cx="${cx - 4}" cy="${cy + 4}" r="8" fill="${body}"/>`;
    if (mood === "over") face += `<circle cx="${cx}" cy="${cy + 4}" r="9" fill="${body}"/>`;
  }
  if (mood === "over") {
    face += `<path d="M ${cx - 22} ${cy - 30} L ${cx + 20} ${cy - 18}" stroke="${eye}" stroke-width="9" stroke-linecap="round"/>`;
  }

  const wing = `<path d="M 168 236 Q 214 318 292 300 Q 246 262 168 236 Z" fill="${eye}" fill-opacity="0.22"/>`;
  const cheek =
    mood === "ok"
      ? `<ellipse cx="318" cy="258" rx="17" ry="11" fill="${BLUSH}" fill-opacity="0.75"/>`
      : "";

  let extra = "";
  if (mood === "tight" || mood === "over") {
    extra += `<path d="M 402 110 Q 388 142 402 154 Q 416 142 402 110 Z" fill="${tokens.blue}"/>`;
  }
  if (mood === "over") {
    extra += `<path d="M 436 152 Q 428 172 436 180 Q 444 172 436 152 Z" fill="${tokens.blue}" fill-opacity="0.7"/>`;
  }
  if (mood === "stale") {
    // Two z's, drawn as strokes: AndroidSVG's <text> would need the font.
    const z = (x: number, y: number, s: number) =>
      `<path d="M ${x} ${y} h ${s} l ${-s} ${s} h ${s}" fill="none" stroke="${tokens.text3}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
    extra += z(370, 110, 36) + z(424, 64, 26);
  }

  // Overspent tips forward, tight leans back a touch.
  const tilt =
    mood === "over"
      ? ` transform="rotate(9 256 330)"`
      : mood === "tight"
        ? ` transform="rotate(-4 256 330)"`
        : "";
  const legs = `<rect x="224" y="340" width="17" height="46" rx="8.5" fill="${body}"/><rect x="259" y="340" width="17" height="46" rx="8.5" fill="${body}"/>`;

  return `<g${tilt}>${legs}<path d="${BIRD_BODY_PATH}" fill="${body}"/>${wing}${cheek}${face}</g>${extra}`;
}

/** The ring gauge with the bird inside it, as a 100x100 SVG. `leftPct` null
 *  (nothing budgeted) draws the empty track. */
type BirdRingArgs = {
  mood: WidgetMood;
  leftPct: number | null;
  tokens: ThemeTokens;
  scheme: "light" | "dark";
  blink?: boolean;
};

export function birdRingSvg({
  mood,
  leftPct,
  tokens,
  scheme,
  blink,
}: BirdRingArgs): string {
  const R = 45;
  const STROKE = 7;
  const circumference = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(1, leftPct ?? 0));
  // A zero-length dash with a round cap still draws a dot at 12 o'clock,
  // which reads as "a little left" when there's nothing left.
  const arc =
    pct > 0
      ? `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${moodColor(mood, tokens)}" stroke-width="${STROKE}" stroke-linecap="round" stroke-dasharray="${(circumference * pct).toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 50 50)"/>`
      : "";
  // The bird's artboard (x 86..444, y 64..386 with its extras) scaled into
  // the ring's inner circle, centred slightly low so the head clears the arc.
  const bird = `<g transform="translate(50 53) scale(0.165) translate(-262 -240)">${birdBody(mood, tokens, scheme, blink)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" fill="none" stroke="${tokens.text}" stroke-opacity="0.09" stroke-width="${STROKE}"/>${arc}${bird}</svg>`;
}

/** Frames shown FRAME_MS apart: eyes open for ~3s, shut for one frame. A
 *  ViewFlipper can't vary per-frame timing, so the hold is the open frame
 *  repeated (it's one PNG on disk either way). A sleeping bird has nothing
 *  to blink, so it stays still. */
export const FRAME_MS = 150;
const OPEN_FRAMES = 20;

export function birdRingFrames(args: Omit<BirdRingArgs, "blink">): string[] | undefined {
  if (args.mood === "stale") return undefined;
  const open = birdRingSvg(args);
  return [...Array<string>(OPEN_FRAMES).fill(open), birdRingSvg({ ...args, blink: true })];
}
