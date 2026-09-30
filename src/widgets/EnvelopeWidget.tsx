// The large (4x4, resizable) widget. Presentational only — RemoteViews via
// react-native-android-widget, not RN views. Rendered both by the app
// (WidgetSync, live data) and the headless widget-task-handler (last
// snapshot), so it must not touch hooks, storage, or navigation itself; only
// clickAction/clickActionData for taps.
import { FlexWidget, TextWidget, SvgWidget } from "react-native-android-widget";
import { fillColor } from "@/src/components/envelope/ProgressBar";
import type { ThemeTokens } from "@/src/theme/tokens";
import { fontFamily } from "@/src/theme/fonts";
import { heroFontSize, layoutFor, widgetMood, withPerDay, type WidgetData } from "./data";
import { birdRingSvg } from "./bird";
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
  const heroColor = data.overspent ? tokens.coral : tokens.text;

  return (
    <WidgetSurface
      tokens={tokens}
      scheme={scheme}
      style={{ padding: 16, paddingVertical: 14 }}
    >
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <SvgWidget
          svg={birdRingSvg({ mood, leftPct: data.leftPct, tokens, scheme })}
          style={{ width: 56, height: 56, marginRight: 12 }}
        />
        <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
          <FlexWidget style={{ flexDirection: "row", alignItems: "flex-end" }}>
            <TextWidget
              text={prefix}
              style={{
                fontSize: 20,
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
                fontSize: heroFontSize(amount, 34),
                fontFamily: fontFamily.displayBold,
                color: color(heroColor),
              }}
            />
          </FlexWidget>
          <TextWidget
            text={withPerDay(data)}
            truncate="END"
            maxLines={1}
            style={{
              fontSize: 11,
              fontFamily: fontFamily.bodyMedium,
              color: color(tokens.text2),
              marginTop: 2,
            }}
          />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget
        style={{
          width: "match_parent",
          flex: 1,
          flexDirection: "column",
          justifyContent: "space-between",
          marginTop: 16,
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
        }}
      >
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
              borderRadius: 100,
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
    </WidgetSurface>
  );
}
