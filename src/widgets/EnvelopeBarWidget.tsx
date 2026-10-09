// The 4x1 "bar" widget: one line, no resize. Same snapshot as the large
// widget: the bird peeking in off the left edge, the hero number with the
// ring gauge, days left and per-day under it, and a round + to log.
import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget'
import type { ThemeTokens } from '@/src/theme/tokens'
import { fontFamily } from '@/src/theme/fonts'
import { heroFontSize, widgetMood, withPerDay, type WidgetData } from './data'
import { WidgetSurface, color } from './surface'
import { plusSvg } from './icons'
import { birdFrames, birdSvg, FRAME_MS, heroTint, ringSvg } from './bird'

const LOG_URI = 'envelope://modals/log-expense'

export function EnvelopeBarWidget({
  tokens,
  scheme,
  width = 320,
  height = 64,
  ...data
}: WidgetData & {
  tokens: ThemeTokens
  scheme: 'light' | 'dark'
  /** Cell size in dp, when known. The provider's floor is 40dp tall, where
   *  the two text lines alone fill the card; most launchers hand out far more. */
  width?: number
  height?: number
}) {
  const mood = widgetMood(data)
  const plus = Math.max(28, Math.min(40, height - 12))
  // Taller than the card so the head clips at the top and the feet sit on
  // the bottom edge: peeking in, not placed.
  const bird = Math.round(height * 1.3)
  const birdW = bird - Math.round(bird * 0.16)
  return (
    <WidgetSurface tokens={tokens} scheme={scheme} mood={mood} style={{ padding: 0 }}>
      <OverlapWidget style={{ width: 'match_parent', height: 'match_parent' }}>
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
          <SvgWidget
            svg={birdSvg({ mood, tokens, scheme })}
            frames={birdFrames({ mood, tokens, scheme })}
            frameInterval={FRAME_MS}
            style={{ width: bird, height: Math.round(bird * 0.85), marginLeft: -Math.round(bird * 0.16) }}
          />
        </FlexWidget>
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingLeft: birdW + 6, paddingRight: 10 }}>
          <FlexWidget style={{ flex: 1, flexDirection: 'column', marginRight: 8 }}>
            <TextWidget
              text={data.totalLeft}
              truncate="END"
              maxLines={1}
              style={{
                fontSize: heroFontSize(data.totalLeft, 22),
                fontFamily: fontFamily.displayBold,
                color: color(heroTint(mood, tokens)),
              }}
            />
            <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
              <SvgWidget svg={ringSvg({ mood, leftPct: data.leftPct, tokens }, '', 14)} style={{ width: 14, height: 14, marginRight: 5 }} />
              <FlexWidget style={{ flex: 1 }}>
                <TextWidget
                  text={withPerDay(data)}
                  truncate="END"
                  maxLines={1}
                  style={{ fontSize: 11, fontFamily: fontFamily.bodySemiBold, color: color(tokens.text2) }}
                />
              </FlexWidget>
            </FlexWidget>
          </FlexWidget>
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: LOG_URI }}
            accessibilityLabel="Log an expense"
            style={{
              width: plus,
              height: plus,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: plus / 2,
              backgroundColor: color(tokens.accent),
            }}
          >
            <SvgWidget svg={plusSvg(tokens.onAccent)} style={{ width: 18, height: 18 }} />
          </FlexWidget>
        </FlexWidget>
      </OverlapWidget>
    </WidgetSurface>
  )
}
