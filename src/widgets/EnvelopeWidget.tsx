// The large (4x4, resizable) widget. Presentational only — RemoteViews via
// react-native-android-widget, not RN views. Rendered both by the app
// (WidgetSync, live data) and the headless widget-task-handler (last
// snapshot), so it must not touch hooks, storage, or navigation itself; only
// clickAction/clickActionData for taps.
import { FlexWidget, OverlapWidget, TextWidget, SvgWidget } from "react-native-android-widget";
import { fillColor } from "@/src/components/envelope/ProgressBar";
import type { ThemeTokens } from "@/src/theme/tokens";
import { fontFamily } from "@/src/theme/fonts";
import { heroFontSize, layoutFor, widgetMood, withPerDay, type WidgetData } from "./data";
import { birdFrames, birdSvg, FRAME_MS, heroTint, ringSvg } from "./bird";
import { WidgetSurface, color } from "./surface";
import { plusSvg } from "./icons";

const LOG_URI = "envelope://modals/log-expense";

export function EnvelopeWidget({
  tokens,
  scheme,
  width,
  height,
  ...data
}: WidgetData & {
  tokens: ThemeTokens;
  scheme: "light" | "dark";
  width: number;
  height: number;
}) {
  const layout = layoutFor(width, height);
  const rows = data.rows.slice(0, layout.rows);
  const today = data.today.slice(0, layout.today);
  const chips = data.chips.slice(0, layout.buttons);
  const prefix = data.totalLeft.match(/^[^0-9]+/)?.[0] ?? '';
  const amount = data.totalLeft.slice(prefix.length);
  const mood = widgetMood(data);
  const heroColor = heroTint(mood, tokens);

  const trend = data.weeklyTrend;
  const pills: { label: string; value: string; tint: string }[] = [
    // A stale snapshot's allowance is yesterday's (same call as withPerDay).
    { label: "per day", value: mood === "stale" ? "—" : data.perDay || "—", tint: tokens.text },
    { label: "today", value: data.todayTotal || "—", tint: tokens.text },
    {
      label: "week",
      value: trend === null ? "—" : `${trend.pct > 0 ? "+" : ""}${trend.pct}%`,
      tint:
        trend?.dir === "up" ? tokens.coral : trend?.dir === "down" ? tokens.mint : tokens.text,
    },
  ];
  // Bird hangs off the top-left corner (the surface clips it) with the
  // number to its right; the pills run the full width underneath so a long
  // amount still fits in them.
  const bird = 100;
  const birdW = bird - 14;
  const bandHeight = layout.pills ? 122 : 86;

  return (
    <WidgetSurface
      tokens={tokens}
      scheme={scheme}
      mood={mood}
      style={{ padding: 0 }}
    >
      <OverlapWidget style={{ width: "match_parent", height: bandHeight }}>
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
              marginLeft: -14,
              marginTop: -10,
            }}
          />
        </FlexWidget>
        <FlexWidget
          style={{
            width: "match_parent",
            height: "match_parent",
            flexDirection: "column",
            paddingLeft: birdW + 8,
            paddingRight: 16,
            paddingTop: 14,
          }}
        >
          <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "flex-end" }}>
            <TextWidget
              text={prefix}
              style={{
                fontSize: 18,
                fontFamily: fontFamily.displayBold,
                color: color(heroColor),
                marginBottom: 3,
              }}
            />
            <TextWidget
              text={amount}
              truncate="END"
              maxLines={1}
              style={{
                fontSize: heroFontSize(amount, 30),
                fontFamily: fontFamily.displayBold,
                color: color(heroColor),
              }}
            />
          </FlexWidget>
          <FlexWidget
            style={{
              width: "match_parent",
              flexDirection: "row",
              alignItems: "center",
              marginTop: 2,
            }}
          >
            <SvgWidget
              svg={ringSvg({ mood, leftPct: data.leftPct, tokens }, "", 14)}
              style={{ width: 16, height: 16, marginRight: 6 }}
            />
            <FlexWidget style={{ flex: 1 }}>
              <TextWidget
                text={withPerDay(data)}
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
        {layout.pills && (
          <FlexWidget
            style={{
              width: "match_parent",
              height: "match_parent",
              flexDirection: "column",
              justifyContent: "flex-end",
              paddingHorizontal: 16,
              paddingBottom: 10,
            }}
          >
            <FlexWidget
              style={{
                width: "match_parent",
                flexDirection: "row",
                flexGap: 6,
              }}
            >
              {pills.map((pill) => (
                <FlexWidget
                  key={pill.label}
                  style={{
                    flex: 1,
                    flexDirection: "column",
                    alignItems: "center",
                    paddingVertical: 5,
                    paddingHorizontal: 4,
                    borderRadius: 12,
                    backgroundColor: color(
                      scheme === "dark" ? "rgba(255, 255, 255, 0.07)" : tokens.pillBg,
                    ),
                    borderWidth: 1,
                    borderColor: color(tokens.border),
                  }}
                >
                  <TextWidget
                    text={pill.value}
                    truncate="END"
                    maxLines={1}
                    style={{
                      fontSize: 12,
                      fontFamily: fontFamily.displayBold,
                      color: color(pill.tint),
                    }}
                  />
                  <TextWidget
                    text={pill.label}
                    style={{
                      fontSize: 9,
                      fontFamily: fontFamily.bodySemiBold,
                      color: color(tokens.text3),
                    }}
                  />
                </FlexWidget>
              ))}
            </FlexWidget>
          </FlexWidget>
        )}
      </OverlapWidget>

      <FlexWidget
        style={{
          width: "match_parent",
          flex: 1,
          flexDirection: "column",
          justifyContent: "space-between",
          marginTop: 10,
          paddingHorizontal: 16,
        }}
      >
        {rows.length > 0 && (
          <FlexWidget
            style={{
              width: "match_parent",
              flexDirection: "column",
              flexGap: 12,
            }}
          >
            {rows.map((row) => {
              // Clamped so a fully-spent envelope still leaves a visible track
              // remainder — a bar that reaches the full width reads as a
              // section divider, not a progress bar.
              const filled = Math.max(2, Math.min(92, Math.round(row.pct)));
              return (
                <FlexWidget
                  key={row.name}
                  style={{
                    width: "match_parent",
                    flexDirection: "column",
                    flexGap: 5,
                  }}
                >
                  <FlexWidget
                    style={{
                      width: "match_parent",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    {row.icon !== "" && (
                      <TextWidget
                        text={row.icon}
                        style={{ fontSize: 13, marginRight: 6 }}
                      />
                    )}
                    <FlexWidget style={{ flex: 1 }}>
                      <TextWidget
                        text={row.name}
                        truncate="END"
                        maxLines={1}
                        style={{
                          fontSize: 13,
                          fontFamily: fontFamily.bodySemiBold,
                          color: color(tokens.text),
                        }}
                      />
                    </FlexWidget>
                    <TextWidget
                      text={row.available}
                      style={{
                        fontSize: 13,
                        fontFamily: fontFamily.bodySemiBold,
                        color: color(
                          row.overspent ? tokens.coral : tokens.mint,
                        ),
                      }}
                    />
                  </FlexWidget>
                  <FlexWidget
                    style={{
                      width: "match_parent",
                      flexDirection: "row",
                      height: 5,
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <FlexWidget
                      style={{
                        flex: filled,
                        height: 5,
                        backgroundColor: color(fillColor(row.pct, tokens)),
                      }}
                    />
                    <FlexWidget
                      style={{
                        flex: 100 - filled,
                        height: 5,
                        backgroundColor: color(tokens.border),
                      }}
                    />
                  </FlexWidget>
                </FlexWidget>
              );
            })}
          </FlexWidget>
        )}

        {layout.today > 0 && (
          <FlexWidget
            style={{ width: "match_parent", flexDirection: "column" }}
          >
            <TextWidget
              text="TODAY"
              style={{
                fontSize: 10,
                fontFamily: fontFamily.bodySemiBold,
                color: color(tokens.text3),
                letterSpacing: 0.5,
                marginTop: 16,
                marginBottom: 6,
              }}
            />
            {today.length === 0 ? (
              <TextWidget
                text="Nothing logged yet"
                style={{
                  fontSize: 12,
                  fontFamily: fontFamily.bodyMedium,
                  color: color(tokens.text3),
                }}
              />
            ) : (
              today.map((t, i) => (
                <FlexWidget
                  key={i}
                  style={{
                    width: "match_parent",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: i === 0 ? 0 : 4,
                  }}
                >
                  <TextWidget
                    text={t.item}
                    truncate="END"
                    maxLines={1}
                    style={{
                      fontSize: 12,
                      fontFamily: fontFamily.bodyMedium,
                      color: color(tokens.text2),
                    }}
                  />
                  <TextWidget
                    text={t.amount}
                    style={{
                      fontSize: 12,
                      fontFamily: fontFamily.bodyMedium,
                      color: color(tokens.text),
                    }}
                  />
                </FlexWidget>
              ))
            )}
          </FlexWidget>
        )}
      </FlexWidget>

      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          flexGap: 6,
          marginTop: 12,
          paddingHorizontal: 16,
          paddingBottom: 14,
        }}
      >
        {/* Half the height, not "big": Android's GradientDrawable doesn't clamp a
            corner radius past that, it draws oval ends. */}
        {chips.map((chip) => (
          <FlexWidget
            key={chip.category}
            clickAction="OPEN_URI"
            clickActionData={{ uri: chip.uri }}
            accessibilityLabel={`Log a ${chip.category} expense`}
            style={{
              flex: 1,
              height: layout.actionHeight,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: layout.actionHeight / 2,
              backgroundColor: color(tokens.chipActiveBg),
            }}
          >
            <TextWidget
              text={chip.label}
              truncate="END"
              maxLines={1}
              style={{
                fontSize: 11,
                fontFamily: fontFamily.bodySemiBold,
                color: color(tokens.text),
              }}
            />
          </FlexWidget>
        ))}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: LOG_URI }}
          accessibilityLabel="Log an expense"
          style={{
            width: layout.actionHeight,
            height: layout.actionHeight,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: layout.actionHeight / 2,
            backgroundColor: color(tokens.accent),
          }}
        >
          <SvgWidget
            svg={plusSvg(tokens.onAccent)}
            style={{ width: 18, height: 18 }}
          />
        </FlexWidget>
      </FlexWidget>
    </WidgetSurface>
  );
}
