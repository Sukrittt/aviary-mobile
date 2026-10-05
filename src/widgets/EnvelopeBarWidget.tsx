// The 4x1 "bar" widget: one line, no resize. Same snapshot as the large
// widget: the bird ring, the hero number with days left and per-day beside
// it, and a round + to log.
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget'
import type { ThemeTokens } from '@/src/theme/tokens'
import { fontFamily } from '@/src/theme/fonts'
import { heroFontSize, widgetMood, withPerDay, type WidgetData } from './data'
import { WidgetSurface, color } from './surface'
import { plusSvg } from './icons'
import { birdRingFrames, birdRingSvg, FRAME_MS } from './bird'

const LOG_URI = 'envelope://modals/log-expense'

export function EnvelopeBarWidget({
  tokens,
  scheme,
  height,
  ...data
}: WidgetData & {
  tokens: ThemeTokens
  scheme: 'light' | 'dark'
  /** Cell height in dp, when known. The provider's floor is 40dp, where a
   *  40dp ring plus padding would clip; most launchers hand out far more. */
  height?: number
}) {
  const mood = widgetMood(data)
  const ring = Math.max(28, Math.min(40, (height ?? 64) - 12))
  return (
    <WidgetSurface
      tokens={tokens}
      scheme={scheme}
      style={{ paddingLeft: 10, paddingRight: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center' }}
    >
      <SvgWidget svg={birdRingSvg({ mood, leftPct: data.leftPct, tokens, scheme })} frames={birdRingFrames({ mood, leftPct: data.leftPct, tokens, scheme })} frameInterval={FRAME_MS} style={{ width: ring, height: ring }} />
      <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 10, marginRight: 8 }}>
        <TextWidget
          text={data.totalLeft}
          truncate="END"
          maxLines={1}
          style={{
            fontSize: heroFontSize(data.totalLeft, 20),
            fontFamily: fontFamily.displayBold,
            color: color(data.overspent ? tokens.coral : tokens.text),
          }}
        />
        <TextWidget
          text={withPerDay(data)}
          truncate="END"
          maxLines={1}
          style={{ fontSize: 11, fontFamily: fontFamily.bodyMedium, color: color(tokens.text2) }}
        />
      </FlexWidget>
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: LOG_URI }}
        accessibilityLabel="Log an expense"
        style={{
          width: ring,
          height: ring,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 100,
          backgroundColor: color(tokens.accent),
        }}
      >
        <SvgWidget svg={plusSvg(tokens.onAccent)} style={{ width: 18, height: 18 }} />
      </FlexWidget>
    </WidgetSurface>
  )
}
