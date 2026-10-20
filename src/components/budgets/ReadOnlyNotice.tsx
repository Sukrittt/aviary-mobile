import type { ComponentType } from 'react'
import { Text, View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Lock } from '@/src/components/shared/icons'
import { Button } from '@/src/components/ui/Button'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { alertReadOnly, READ_ONLY_TITLE, readOnlyCopy } from '@/src/lib/budgetMembership'

/**
 * Whether the open budget is read-only, and `blocked()`: true (after saying
 * why) when it is, for a write that would otherwise fail on a 402.
 */
export function useReadOnly() {
  const { active } = useBudgetSpaces()
  const readOnly = !!active?.readOnly
  return {
    readOnly,
    blocked: () => {
      if (readOnly) alertReadOnly(active)
      return readOnly
    },
  }
}

/** Stands in for a write form when the budget is read-only: say why up front instead of failing on save. */
export function ReadOnlyNotice({ onClose }: { onClose: () => void }) {
  const { tokens } = useTheme()
  const { active } = useBudgetSpaces()
  return (
    <View testID="read-only-notice" accessibilityRole="alert" style={styles.notice}>
      <View style={[styles.icon, { backgroundColor: tokens.warnSoft }]}>
        <Lock size={22} color={tokens.warnInk} weight="fill" />
      </View>
      <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>{READ_ONLY_TITLE}</Text>
      <Text style={[styles.text, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{readOnlyCopy(active)}</Text>
      <Button label="Got it" variant="secondary" size="small" onPress={onClose} style={styles.button} />
    </View>
  )
}

/** A whole write screen's stand-in: the notice, centered, and "Got it" goes back. */
export function ReadOnlyScreen() {
  const { tokens } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.screen, { backgroundColor: tokens.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ReadOnlyNotice onClose={() => router.back()} />
    </View>
  )
}

/** A write screen that opens to the notice instead of its form while the budget is read-only. */
export function withReadOnlyGate<P extends object>(Screen: ComponentType<P>) {
  function Gated(props: P) {
    const { readOnly } = useReadOnly()
    return readOnly ? <ReadOnlyScreen /> : <Screen {...props} />
  }
  Gated.displayName = `ReadOnlyGate(${Screen.displayName ?? Screen.name})`
  return Gated
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  notice: { alignItems: 'center', gap: 10, paddingVertical: 24, paddingHorizontal: 8 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 18, textAlign: 'center' },
  text: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  button: { marginTop: 8, alignSelf: 'center' },
})
