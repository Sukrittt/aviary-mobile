import { AccessibilityInfo, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { ArrowLeft, ArrowClockwise } from '@/src/components/shared/icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { expenseNotice } from '@/src/lib/expenseNotice'

/** A separate full-screen presentation; the list/editor stays mounted beneath it. */
export function ExpenseNoticeScreen({ status, action, onBack }: { status?: number; action: 'edit' | 'delete'; onBack: () => void }) {
  const { tokens, space, radius, type } = useTheme()
  const insets = useSafeAreaInsets()
  const copy = expenseNotice(status, action)
  return (
    <Modal visible presentationStyle="fullScreen" animationType="slide" statusBarTranslucent navigationBarTranslucent
      onRequestClose={onBack} onShow={() => AccessibilityInfo.announceForAccessibility(copy.title)}>
      <View style={{ flex: 1, backgroundColor: tokens.bg }} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl }}>
          <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', flex: 1, justifyContent: 'center' }}>
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.accentSoft, borderRadius: radius.md, marginBottom: space.lg }}>
              <ArrowClockwise size={24} color={tokens.accentInk} />
            </View>
            <Text accessibilityRole="header" style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.heading, marginBottom: space.md }}>{copy.title}</Text>
            <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.body, lineHeight: type.body * 1.55 }}>{copy.message}</Text>
            <Pressable accessibilityRole="button" onPress={onBack}
              style={({ pressed }) => ({ minHeight: 50, padding: space.lg, marginTop: space.xxl, borderRadius: radius.full, backgroundColor: tokens.accent, flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <ArrowLeft size={18} color={tokens.onAccent} />
              <Text style={{ color: tokens.onAccent, fontFamily: fontFamily.bodySemiBold, fontSize: type.body, flexShrink: 1, textAlign: 'center' }}>{copy.backLabel}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}
