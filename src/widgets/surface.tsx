// Shared card chrome for all three widget sizes. Near-opaque app surface
// (not glass) so text contrast never depends on the wallpaper behind it, plus
// a faint hero-tinted top-down wash echoing Home's hero section.
//
// `backgroundGradient` replaces a view's whole background drawable (border
// included) natively — see BaseWidget.java's "This will overwrite border"
// comment — so the wash can't live on the same node as the border. It's
// layered on top instead, via OverlapWidget, as its own borderless node.
import { FlexWidget, OverlapWidget } from "react-native-android-widget";
import type { ColorProp, FlexWidgetStyle } from "react-native-android-widget";
import type { ThemeTokens } from "@/src/theme/tokens";
import type { WidgetMood } from "./data";
import { moodWash } from "./bird";

export function color(c: string): ColorProp {
  return c as ColorProp;
}

const SURFACE_DARK = color("rgba(10, 10, 10, 0.94)");
const SURFACE_LIGHT = color("rgba(252, 252, 252, 0.94)");
// Matches Android 12+'s own widget-corner mask (system_app_widget_background_radius,
// ~28dp on AOSP/Pixel) — a different radius here double-corners against it.
const RADIUS = 28;

export function WidgetSurface({
  tokens,
  scheme,
  mood,
  height,
  style,
  children,
}: {
  tokens: ThemeTokens;
  scheme: "light" | "dark";
  /** Tints the wash by mood (yellow when tight, coral when over). Without
   *  it the wash is Home's fixed peach. */
  mood?: WidgetMood;
  /** Fixed card height in dp. Without it the card fills whatever cell the
   *  launcher hands out, and a "2x2" cell is not square — on a Pixel-class
   *  grid it is ~132dp wide by ~188dp tall, which is what made the mini
   *  widget look stretched next to a square one.
   *
   *  The cell keeps its full height either way (a 132dp-tall card cannot
   *  occupy fewer than two ~94dp rows), so the card is centred in it rather
   *  than left sitting at the top with all the slack below — which is what
   *  slice does, and why its widget lines up with its neighbours. */
  height?: number;
  style?: FlexWidgetStyle;
  children?: React.ReactNode;
}) {
  const heroFrom = color(mood ? moodWash(mood, tokens) : tokens.heroA);
  const heroTo = color(
    scheme === "dark" ? "rgba(0, 0, 0, 0)" : "rgba(255, 255, 255, 0)",
  );

  const card = (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: height ?? "match_parent",
        width: "match_parent",
        backgroundColor: scheme === "dark" ? SURFACE_DARK : SURFACE_LIGHT,
        borderWidth: 1,
        borderColor: color(tokens.border),
        borderRadius: RADIUS,
        overflow: "hidden",
      }}
    >
      <OverlapWidget style={{ width: "match_parent", height: "match_parent" }}>
        <FlexWidget
          style={{
            width: "match_parent",
            height: "match_parent",
            backgroundGradient: {
              from: heroFrom,
              to: heroTo,
              orientation: "TOP_BOTTOM",
            },
          }}
        />
        <FlexWidget
          clickAction="OPEN_APP"
          style={{
            width: "match_parent",
            height: "match_parent",
            flexDirection: "column",
            ...style,
          }}
        >
          {children}
        </FlexWidget>
      </OverlapWidget>
    </FlexWidget>
  );

  if (height === undefined) return card;

  return (
    <FlexWidget
      style={{
        width: "match_parent",
        height: "match_parent",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {card}
    </FlexWidget>
  );
}
