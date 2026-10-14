// Shared no-snapshot state for all three widget sizes — rendered whenever
// there's nothing to show yet (never signed in) or the snapshot was cleared
// on logout or when the account lost access (see lockWidgets in WidgetSync).
import { TextWidget } from 'react-native-android-widget'
import type { ThemeTokens } from '@/src/theme/tokens'
import { widgetFontFamily as fontFamily } from '@/src/theme/fonts'
import { WidgetSurface, color } from './surface'

export function SignInWidget({
  tokens,
  scheme,
  compact,
}: {
  tokens: ThemeTokens
  scheme: 'light' | 'dark'
  compact?: boolean
}) {
  return (
    <WidgetSurface tokens={tokens} scheme={scheme} style={{ padding: 16, alignItems: 'center', justifyContent: 'center' }}>
      <TextWidget
        text="Aviary"
        style={{ fontSize: compact ? 13 : 15, fontFamily: fontFamily.bodySemiBold, color: color(tokens.text) }}
      />
      {!compact && (
        <TextWidget
          text="Open Aviary to see your budget"
          style={{ fontSize: 12, fontFamily: fontFamily.bodyMedium, color: color(tokens.text3), marginTop: 4, textAlign: 'center' }}
        />
      )}
    </WidgetSurface>
  )
}
