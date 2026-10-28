// Shared no-snapshot state for all three widget sizes, rendered whenever
// there's nothing to show yet (never signed in) or the snapshot was cleared
// on logout or when the account lost access (see lockWidgets in WidgetSync).
//
// Each size keeps its signed-in shape so nothing jumps on sign-in: the
// sleeping (stale) bird, the doodles, and a — where the number goes, plus a
// "Sign in" pill. The whole card opens the app either way.
import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget'
import type { ThemeTokens } from '@/src/theme/tokens'
import { widgetFontFamily as fontFamily } from '@/src/theme/fonts'
import { WidgetSurface, color } from './surface'
import { birdRingSvg, birdSvg } from './bird'
import { doodlesSvg } from './doodles'
import { arrowRightSvg } from './icons'

type Props = {
  tokens: ThemeTokens
  scheme: 'light' | 'dark'
  /** "Envelope" (large), "EnvelopeBar" or "EnvelopeMini". */
  widgetName: string
  /** Cell size in dp, from WidgetInfo. */
  width: number
  height: number
}

export function SignInWidget(props: Props) {
  if (props.widgetName === 'EnvelopeMini') return <Mini {...props} />
  if (props.widgetName === 'EnvelopeBar') return <Bar {...props} />
  return <Large {...props} />
}

function Pill({ tokens, arrow = true }: { tokens: ThemeTokens; arrow?: boolean }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 30,
        paddingLeft: 14,
        paddingRight: 14,
        borderRadius: 15,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: color(tokens.accentSoft),
      }}
    >
      <TextWidget text="Sign in" style={{ fontSize: 13, fontFamily: fontFamily.bodySemiBold, color: color(tokens.accentInk) }} />
      {arrow ? <SvgWidget svg={arrowRightSvg(tokens.accentInk)} style={{ width: 12, height: 12, marginLeft: 6 }} /> : null}
    </FlexWidget>
  )
}

const labelStyle = (tokens: ThemeTokens) => ({ fontSize: 12, fontFamily: fontFamily.bodySemiBold, color: color(tokens.text3) })

/** Square, like EnvelopeMiniWidget: bird peeking in top-left, pill at the bottom. */
function Mini({ tokens, scheme, width }: Props) {
  const bird = Math.round(width * 0.66)
  return (
    <WidgetSurface tokens={tokens} scheme={scheme} mood="stale" height={width} style={{ padding: 0 }}>
      <OverlapWidget style={{ width: 'match_parent', height: 'match_parent' }}>
        {/* The triangle and stripes would land under the text. */}
        <SvgWidget svg={doodlesSvg(width, width, tokens, scheme, ['triangle', 'stripes'])} style={{ width: 'match_parent', height: 'match_parent' }} />
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column', alignItems: 'flex-start' }}>
          <SvgWidget
            svg={birdSvg({ mood: 'stale', tokens, scheme })}
            style={{
              width: bird,
              height: Math.round(bird * 0.85),
              marginLeft: -Math.round(bird * 0.16),
              marginTop: -Math.round(bird * 0.1),
            }}
          />
        </FlexWidget>
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column', justifyContent: 'flex-end', padding: 12 }}>
          <TextWidget text="I'm napping" style={{ ...labelStyle(tokens), marginBottom: 6 }} />
          <Pill tokens={tokens} />
        </FlexWidget>
      </OverlapWidget>
    </WidgetSurface>
  )
}

/** One line, like EnvelopeBarWidget, with the pill where the + goes. */
function Bar({ tokens, scheme, width, height }: Props) {
  const bird = Math.round(height * 1.3)
  const birdW = bird - Math.round(bird * 0.16)
  return (
    <WidgetSurface tokens={tokens} scheme={scheme} mood="stale" style={{ padding: 0 }}>
      <OverlapWidget style={{ width: 'match_parent', height: 'match_parent' }}>
        <SvgWidget svg={doodlesSvg(width, height, tokens, scheme)} style={{ width: 'match_parent', height: 'match_parent' }} />
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
          <SvgWidget
            svg={birdSvg({ mood: 'stale', tokens, scheme })}
            style={{ width: bird, height: Math.round(bird * 0.85), marginLeft: -Math.round(bird * 0.16) }}
          />
        </FlexWidget>
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingLeft: birdW + 6, paddingRight: 10 }}>
          <FlexWidget style={{ flex: 1, flexDirection: 'column', marginRight: 8 }}>
            <TextWidget text="—" style={{ fontSize: 22, fontFamily: fontFamily.displayBold, color: color(tokens.text) }} />
            <TextWidget text="Your budget's napping" truncate="END" maxLines={1} style={labelStyle(tokens)} />
          </FlexWidget>
          <Pill tokens={tokens} arrow={false} />
        </FlexWidget>
      </OverlapWidget>
    </WidgetSurface>
  )
}

const PAD = 18
const RING = 64
const GHOST_ROW = 34
// Placeholder name-bar widths, as a share of the row, so the rows don't line up.
const GHOST_NAMES = [0.71, 0.62, 0.79, 0.55]

/** The large widget's layout with nothing in it: ring, —, and a few ghost category rows. */
function Large({ tokens, scheme, width, height }: Props) {
  // Whatever's left between the header and the footer, in whole rows.
  const rows = Math.max(0, Math.min(GHOST_NAMES.length, Math.floor((height - PAD * 2 - RING - 30 - 12) / GHOST_ROW)))
  const inner = width - PAD * 2 - 32
  const fill = color(tokens.border)
  return (
    <WidgetSurface tokens={tokens} scheme={scheme} mood="stale" style={{ padding: 0 }}>
      <OverlapWidget style={{ width: 'match_parent', height: 'match_parent' }}>
        <SvgWidget svg={doodlesSvg(width, 110, tokens, scheme)} style={{ width: 'match_parent', height: 110 }} />
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column', padding: PAD }}>
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
            <SvgWidget svg={birdRingSvg({ mood: 'stale', leftPct: null, tokens, scheme })} style={{ width: RING, height: RING, marginRight: 14 }} />
            <FlexWidget style={{ flexDirection: 'column' }}>
              <TextWidget text="—" style={{ fontSize: 30, fontFamily: fontFamily.displayBold, color: color(tokens.text) }} />
              <TextWidget text="left this month" style={{ ...labelStyle(tokens), marginTop: 4 }} />
            </FlexWidget>
          </FlexWidget>
          {GHOST_NAMES.slice(0, rows).map((share, i) => (
            <FlexWidget key={i} style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              <FlexWidget style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: fill, marginRight: 10 }} />
              <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
                <FlexWidget style={{ width: Math.round(inner * share), height: 10, borderRadius: 5, backgroundColor: fill }} />
                <FlexWidget style={{ width: 'match_parent', height: 6, borderRadius: 3, backgroundColor: fill, marginTop: 6 }} />
              </FlexWidget>
            </FlexWidget>
          ))}
          <FlexWidget style={{ flex: 1 }} />
          <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
            <FlexWidget style={{ flex: 1, marginRight: 10 }}>
              <TextWidget
                text="Sign in and your budget lands here."
                maxLines={2}
                truncate="END"
                style={{ fontSize: 13, fontFamily: fontFamily.bodySemiBold, color: color(tokens.text2) }}
              />
            </FlexWidget>
            <Pill tokens={tokens} />
          </FlexWidget>
        </FlexWidget>
      </OverlapWidget>
    </WidgetSurface>
  )
}
