// The 2x2 "mini" widget: fixed size, no resize. Ring gauge with the bird in
// it top-left, a round + in the corner, and the number across the bottom
// where it gets the full width.
//
// A 2x2 cell is not square: the launcher hands out roughly 131dp by 184dp, so
// a match_parent card comes out stretched next to a square one (slice's, say).
// The card is drawn at `width` dp tall instead, which is the width Android
// reports for the cell, so it lands as an actual square.
import { FlexWidget, TextWidget, SvgWidget } from "react-native-android-widget";
import type { ThemeTokens } from "@/src/theme/tokens";
import { fontFamily } from "@/src/theme/fonts";
import { headerRightLabel, heroFontSize, widgetMood, type WidgetData } from "./data";
import { WidgetSurface, color } from "./surface";
import { plusSvg } from "./icons";
import { birdRingSvg } from "./bird";

const LOG_URI = "envelope://modals/log-expense";

export function EnvelopeMiniWidget({
  tokens,
  scheme,
  width,
  ...data
}: WidgetData & {
  tokens: ThemeTokens;
  scheme: "light" | "dark";
  /** Cell width in dp, from WidgetInfo. Doubles as the card's height. */
  width: number;
}) {
  const mood = widgetMood(data);
  // Scales with the cell so the ring stays the hero at the 110dp floor and
  // doesn't swallow the card at the roomy end.
  const ring = Math.max(44, Math.min(60, Math.round(width * 0.4)));
  return (
    <WidgetSurface
      tokens={tokens}
      scheme={scheme}
      height={width}
      style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 }}
    >
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <SvgWidget
          svg={birdRingSvg({ mood, leftPct: data.leftPct, tokens, scheme })}
          style={{ width: ring, height: ring }}
        />
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: LOG_URI }}
          accessibilityLabel="Log an expense"
          style={{
            width: 40,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 100,
            backgroundColor: color(tokens.accent),
          }}
        >
          <SvgWidget
            svg={plusSvg(tokens.onAccent)}
            style={{ width: 18, height: 18 }}
          />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flex: 1 }} />
      <TextWidget
        text={data.totalLeft}
        truncate="END"
        maxLines={1}
        style={{
          width: "match_parent",
          fontSize: heroFontSize(data.totalLeft, 24),
          fontFamily: fontFamily.displayBold,
          color: color(data.overspent ? tokens.coral : tokens.text),
        }}
      />
      <TextWidget
        text={headerRightLabel(data.daysLeft, data.updatedAt)}
        truncate="END"
        maxLines={1}
        style={{
          width: "match_parent",
          fontSize: 11,
          fontFamily: fontFamily.bodyMedium,
          color: color(tokens.text2),
          marginTop: 2,
        }}
      />
    </WidgetSurface>
  );
}
