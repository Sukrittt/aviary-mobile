// The 2x2 "mini" widget: fixed size, no resize. The bird, oversized, peeks
// in off the top-left corner; a round + sits top-right; the number runs
// across the bottom where it gets the full width, with a small ring gauge in
// the label line under it.
//
// A 2x2 cell is not square: the launcher hands out roughly 131dp by 184dp, so
// a match_parent card comes out stretched next to a square one (slice's, say).
// The card is drawn at `width` dp tall instead, which is the width Android
// reports for the cell, so it lands as an actual square.
import { FlexWidget, OverlapWidget, TextWidget, SvgWidget } from "react-native-android-widget";
import type { ThemeTokens } from "@/src/theme/tokens";
import { fontFamily } from "@/src/theme/fonts";
import { headerRightLabel, heroFontSize, widgetMood, type WidgetData } from "./data";
import { WidgetSurface, color } from "./surface";
import { plusSvg } from "./icons";
import { birdFrames, birdSvg, FRAME_MS, heroTint, ringSvg } from "./bird";
import { doodlesSvg } from "./doodles";

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
  // Two thirds of the card, hanging off the corner so it reads as peeking
  // in rather than placed. The card clips it (overflow hidden on the surface).
  const bird = Math.round(width * 0.66);
  return (
    <WidgetSurface
      tokens={tokens}
      scheme={scheme}
      mood={mood}
      height={width}
      style={{ padding: 0 }}
    >
      <OverlapWidget style={{ width: "match_parent", height: "match_parent" }}>
        <SvgWidget
          svg={doodlesSvg(width, width, tokens, scheme)}
          style={{ width: "match_parent", height: "match_parent" }}
        />
        <FlexWidget
          style={{
            width: "match_parent",
            height: "match_parent",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <SvgWidget
            svg={birdSvg({ mood, tokens, scheme })}
            frames={birdFrames({ mood, tokens, scheme })}
            frameInterval={FRAME_MS}
            style={{
              width: bird,
              height: Math.round(bird * 0.85),
              marginLeft: -Math.round(bird * 0.16),
              marginTop: -Math.round(bird * 0.1),
            }}
          />
        </FlexWidget>
        <FlexWidget
          style={{
            width: "match_parent",
            height: "match_parent",
            flexDirection: "column",
            padding: 12,
          }}
        >
          <FlexWidget
            style={{
              width: "match_parent",
              flexDirection: "row",
              justifyContent: "flex-end",
            }}
          >
            <FlexWidget
              clickAction="OPEN_URI"
              clickActionData={{ uri: LOG_URI }}
              accessibilityLabel="Log an expense"
              style={{
                width: 40,
                height: 40,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 20,
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
              color: color(heroTint(mood, tokens)),
            }}
          />
          <FlexWidget
            style={{
              width: "match_parent",
              flexDirection: "row",
              alignItems: "center",
              marginTop: 3,
            }}
          >
            <SvgWidget
              svg={ringSvg({ mood, leftPct: data.leftPct, tokens }, "", 14)}
              style={{ width: 16, height: 16, marginRight: 6 }}
            />
            <FlexWidget style={{ flex: 1 }}>
              <TextWidget
                text={headerRightLabel(data.daysLeft, data.updatedAt)}
                truncate="END"
                maxLines={1}
                style={{
                  fontSize: 11,
                  fontFamily: fontFamily.bodySemiBold,
                  color: color(tokens.text2),
                }}
              />
            </FlexWidget>
          </FlexWidget>
        </FlexWidget>
      </OverlapWidget>
    </WidgetSurface>
  );
}
