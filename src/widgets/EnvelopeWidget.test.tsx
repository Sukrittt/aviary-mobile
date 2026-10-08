// Each widget has to survive buildWidgetTree — the library walks the JSX
// itself rather than rendering it through React, so anything React tolerates
// but the walker does not (a Fragment, most of all) throws here and the
// launcher is left showing an empty frame with no error anywhere on screen.
import { buildWidgetTree } from "react-native-android-widget/src/api/build-widget-tree";
import { darkTokens, lightTokens } from "@/src/theme/tokens";
import type { WidgetData } from "./data";
import { birdFrames, birdRingFrames, birdRingSvg, birdSvg } from "./bird";
import { doodlesSvg } from "./doodles";
import { BIRD_EYE } from "@/src/components/splash/birdPath";
import { EnvelopeWidget } from "./EnvelopeWidget";
import { EnvelopeBarWidget } from "./EnvelopeBarWidget";
import { EnvelopeMiniWidget } from "./EnvelopeMiniWidget";

const data: WidgetData = {
  totalLeft: "₹85,287",
  daysLeft: 26,
  updatedAt: Date.now(),
  rows: [
    {
      icon: "🍔",
      name: "Food",
      pct: 82,
      available: "₹2,100",
      overspent: false,
    },
    { icon: "", name: "Rent", pct: 100, available: "-₹500", overspent: true },
  ],
  chips: [
    {
      category: "🍔 Food",
      label: "Food",
      uri: "envelope://modals/log-expense?category=Food",
    },
    {
      category: "🚕 Travel",
      label: "Travel",
      uri: "envelope://modals/log-expense?category=Travel",
    },
  ],
  today: [{ item: "Coffee", amount: "₹180" }],
  todayTotal: "₹300",
  weeklyTrend: { pct: 20, dir: "down" },
  leftPct: 0.48,
  monthPct: 0.4,
  perDay: "₹3,280",
  overspent: false,
};

const DAY = 86_400_000;
// One fixture per bird mood, by way of the fields widgetMood reads.
const moods: [string, WidgetData][] = [
  ["ok", data],
  ["tight", { ...data, leftPct: 0.1 }],
  ["over", { ...data, totalLeft: "-₹1,860", leftPct: 0, overspent: true }],
  ["stale", { ...data, updatedAt: Date.now() - 3 * DAY }],
];

describe("widget trees build", () => {
  // 4x4 through the tallest resize the provider allows.
  it.each([
    [250, 250],
    [250, 400],
    [320, 340],
  ])("EnvelopeWidget at %ix%i", (width, height) => {
    expect(() =>
      buildWidgetTree(
        <EnvelopeWidget
          {...data}
          tokens={darkTokens}
          scheme="dark"
          width={width}
          height={height}
        />,
      ),
    ).not.toThrow();
  });

  it("EnvelopeBarWidget", () => {
    expect(() =>
      buildWidgetTree(
        <EnvelopeBarWidget {...data} tokens={darkTokens} scheme="dark" />,
      ),
    ).not.toThrow();
  });

  it("EnvelopeMiniWidget", () => {
    expect(() =>
      buildWidgetTree(
        <EnvelopeMiniWidget
          {...data}
          tokens={darkTokens}
          scheme="dark"
          width={131}
        />,
      ),
    ).not.toThrow();
  });
});

// A 2x2 cell is taller than it is wide (~131x184dp on a Pixel-class grid), so
// a match_parent card comes out stretched next to a square one. The card takes
// its height from the cell width instead.
describe("EnvelopeMiniWidget draws a square card", () => {
  it.each([131, 110, 160])("at %idp wide", (width) => {
    const tree = buildWidgetTree(
      <EnvelopeMiniWidget
        {...data}
        tokens={darkTokens}
        scheme="dark"
        width={width}
      />,
    );
    // buildWidgetTree flattens style onto props. The root fills the cell and
    // centres the card; the card itself is the square one.
    const root = tree.props as { height: unknown; gravity: unknown };
    expect(root.height).toBe("match_parent");

    const card = tree.children![0].props as {
      width: unknown;
      height: unknown;
    };
    expect(card.height).toBe(width);
    expect(card.width).toBe("match_parent");
  });
});

describe("every mood builds in both themes", () => {
  const schemes = [
    ["light", lightTokens],
    ["dark", darkTokens],
  ] as const;
  it.each(moods.flatMap(([mood, d]) => schemes.map(([scheme, tokens]) => [mood, scheme, d, tokens] as const)))(
    "%s, %s",
    (_mood, scheme, d, tokens) => {
      expect(() =>
        buildWidgetTree(<EnvelopeWidget {...d} tokens={tokens} scheme={scheme} width={250} height={250} />),
      ).not.toThrow();
      expect(() =>
        buildWidgetTree(<EnvelopeBarWidget {...d} tokens={tokens} scheme={scheme} height={40} />),
      ).not.toThrow();
      expect(() =>
        buildWidgetTree(<EnvelopeMiniWidget {...d} tokens={tokens} scheme={scheme} width={131} />),
      ).not.toThrow();
    },
  );

  it("paints the dark card on a dark surface and the light card on a light one", () => {
    const light = JSON.stringify(buildWidgetTree(<EnvelopeMiniWidget {...data} tokens={lightTokens} scheme="light" width={131} />));
    const dark = JSON.stringify(buildWidgetTree(<EnvelopeMiniWidget {...data} tokens={darkTokens} scheme="dark" width={131} />));
    expect(light).toContain(`"backgroundColor":"#f0fcfcfc"`);
    expect(dark).toContain(`"backgroundColor":"#f00a0a0a"`);
    expect(light).not.toBe(dark);
  });
});

describe("birdRingSvg", () => {
  const svg = (over: Partial<Parameters<typeof birdRingSvg>[0]> = {}) =>
    birdRingSvg({ mood: "ok", leftPct: 0.5, tokens: lightTokens, scheme: "light", ...over });

  // AndroidSVG, not a browser, draws this: no CSS variables, no rgba().
  it.each(["ok", "tight", "over", "stale"] as const)("uses only literal hex colors for %s", (mood) => {
    for (const scheme of ["light", "dark"] as const) {
      const out = svg({ mood, scheme, tokens: scheme === "dark" ? darkTokens : lightTokens });
      expect(out).not.toMatch(/var\(|rgba\(/);
    }
  });

  it("draws a different bird for each mood", () => {
    const out = new Set((["ok", "tight", "over", "stale"] as const).map((mood) => svg({ mood })));
    expect(out.size).toBe(4);
  });

  it("colors the arc by mood", () => {
    expect(svg({ mood: "ok" })).toContain(`stroke="${lightTokens.mint}"`);
    expect(svg({ mood: "tight", leftPct: 0.1 })).toContain(`stroke="${lightTokens.warn}"`);
  });

  it("punches the eye in the card's own color, so it follows the theme", () => {
    expect(svg({ scheme: "light" })).toContain('fill="#fcfcfc"');
    expect(svg({ scheme: "dark", tokens: darkTokens })).toContain('fill="#0a0a0a"');
  });

  it("leaves out the arc entirely at zero, rather than a round-cap dot", () => {
    expect(svg({ leftPct: 0 })).not.toContain("stroke-dasharray");
    expect(svg({ leftPct: null })).not.toContain("stroke-dasharray");
  });
});

describe("birdRingFrames", () => {
  const args = { leftPct: 0.5, tokens: lightTokens, scheme: "light" as const };

  it("holds the open-eyed bird, then shuts the eye for the last frame", () => {
    const frames = birdRingFrames({ ...args, mood: "ok" })!;
    const open = birdRingSvg({ ...args, mood: "ok" });
    expect(frames.slice(0, -1).every((f) => f === open)).toBe(true);
    expect(frames.at(-1)).toBe(birdRingSvg({ ...args, mood: "ok", blink: true }));
    expect(frames.at(-1)).not.toBe(open);
  });

  it("keeps the overspent brow while blinking", () => {
    const { cx, cy } = BIRD_EYE;
    const blink = birdRingFrames({ ...args, mood: "over" })!.at(-1)!;
    expect(blink).toContain(`M ${cx - 22} ${cy - 30} L ${cx + 20} ${cy - 18}`);
  });

  it("leaves a sleeping bird still", () => {
    expect(birdRingFrames({ ...args, mood: "stale" })).toBeUndefined();
  });
});

describe("birdSvg", () => {
  const args = { tokens: lightTokens, scheme: "light" as const };

  it.each(["ok", "tight", "over", "stale"] as const)("uses only literal hex colors for %s", (mood) => {
    for (const scheme of ["light", "dark"] as const) {
      const out = birdSvg({ mood, scheme, tokens: scheme === "dark" ? darkTokens : lightTokens });
      expect(out).not.toMatch(/var\(|rgba\(/);
    }
  });

  it("keeps the sweat drop on the head, not floating off it", () => {
    // Head: centre ~(250, 238), radius 110. The drop's tip must sit within
    // a drop's width of the contour.
    const drop = birdSvg({ ...args, mood: "tight" }).match(/<path d="M (\d+) (\d+) Q[^"]*" fill="#[0-9a-f]{6}"\/>/);
    expect(drop).not.toBeNull();
    const [x, y] = [Number(drop![1]), Number(drop![2])];
    const fromCentre = Math.hypot(x - 250, y - 238);
    expect(fromCentre).toBeGreaterThan(110);
    expect(fromCentre).toBeLessThan(110 + 50);
  });

  it("blinks like the ring version and sleeps still", () => {
    const frames = birdFrames({ ...args, mood: "ok" })!;
    expect(frames.at(-1)).toBe(birdSvg({ ...args, mood: "ok", blink: true }));
    expect(frames.at(-1)).not.toBe(frames[0]);
    expect(birdFrames({ ...args, mood: "stale" })).toBeUndefined();
  });
});

describe("doodlesSvg", () => {
  it("draws hex-only strokes and picks the wide set for a wide band", () => {
    const square = doodlesSvg(150, 150, lightTokens, "light");
    const wide = doodlesSvg(300, 120, darkTokens, "dark");
    expect(square).not.toMatch(/var\(|rgba\(/);
    expect(square).not.toBe(wide);
    expect(wide).toContain(`stroke="${darkTokens.text}"`);
  });
});

describe("the large widget's pill row", () => {
  const tree = (height: number) =>
    JSON.stringify(buildWidgetTree(<EnvelopeWidget {...data} tokens={lightTokens} scheme="light" width={250} height={height} />));

  it("shows per day, today and the week trend from the 260 band up", () => {
    const tall = tree(300);
    expect(tall).toContain('"text":"per day"');
    expect(tall).toContain('"text":"₹300"');
    expect(tall).toContain('"text":"+20%"');
  });

  it("stays out of the short bands", () => {
    expect(tree(200)).not.toContain('"text":"per day"');
  });

  it("hides a stale snapshot's per-day allowance", () => {
    const stale = JSON.stringify(buildWidgetTree(<EnvelopeWidget {...data} updatedAt={Date.now() - 3 * DAY} tokens={lightTokens} scheme="light" width={250} height={300} />));
    expect(stale).not.toContain('"text":"₹3,280"');
  });

  it("shows the placeholder glyph for a snapshot without today's total", () => {
    const old = JSON.stringify(buildWidgetTree(<EnvelopeWidget {...data} todayTotal="" weeklyTrend={null} tokens={lightTokens} scheme="light" width={250} height={300} />));
    expect(old).toContain(JSON.stringify({ text: "\u2014" }).slice(1, -1));
  });
});
