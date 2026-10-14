import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { ArrowLeft, ArrowRight, ArrowClockwise } from '@/src/components/shared/icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

export interface ConflictReviewRow {
  label: string
  saved: string
  next: string
}

interface Props {
  title: string
  heading: string
  description: string
  rows: ConflictReviewRow[]
  guidance: string
  announcement: string
  testID: string
  onChoose: (keepDraft: boolean) => void
  onClose: () => void
}

/** Shared full-screen review for writes rejected because a newer version exists. */
export function ConflictReview({
  title,
  heading,
  description,
  rows,
  guidance,
  announcement,
  testID,
  onChoose,
  onClose,
}: Props) {
  const { tokens, space, radius, type } = useTheme()
  const insets = useSafeAreaInsets()
  const { width, fontScale } = useWindowDimensions()
  const stacked = width < 360 || fontScale > 1.25
  const body = { color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.body, lineHeight: type.body * 1.55 }
  const caption = { color: tokens.text2, fontFamily: fontFamily.bodyMedium, fontSize: type.caption }

  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
      onShow={() => AccessibilityInfo.announceForAccessibility(announcement)}
    >
      <View style={[styles.screen, { backgroundColor: tokens.bg }]} accessibilityViewIsModal>
        <ScrollView
          testID={testID}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + space.sm,
            paddingBottom: insets.bottom + space.xl,
            paddingHorizontal: space.xl,
          }}
        >
          <View style={styles.content}>
            <View style={[styles.header, { borderBottomColor: tokens.border, marginBottom: space.xl }]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Back to editing" onPress={onClose} style={styles.back}>
                <ArrowLeft size={22} color={tokens.text} />
              </Pressable>
              <Text
                accessibilityRole="header"
                style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }}
              >
                {title}
              </Text>
            </View>
            <View style={[styles.icon, { backgroundColor: tokens.accentSoft, borderRadius: radius.md }]}>
              <ArrowClockwise size={24} color={tokens.accentInk} />
            </View>
            <Text
              accessibilityRole="header"
              style={{
                color: tokens.text,
                fontFamily: fontFamily.displaySemiBold,
                fontSize: type.title,
                marginTop: space.lg,
                marginBottom: space.sm,
              }}
            >
              {heading}
            </Text>
            <Text style={body}>{description}</Text>
            {rows.length > 0 && (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: tokens.borderStrong,
                  borderRadius: radius.lg,
                  padding: space.lg,
                  marginVertical: space.xl,
                }}
              >
                {!stacked && (
                  <View style={[styles.columns, { marginBottom: space.sm }]}>
                    <Text style={[caption, styles.column]}>Latest saved</Text>
                    <Text style={[caption, styles.column]}>With your changes</Text>
                  </View>
                )}
                {rows.map((row, index) => (
                  <View
                    key={row.label}
                    style={{ paddingVertical: space.md, borderTopWidth: index ? 1 : 0, borderTopColor: tokens.border }}
                  >
                    <Text style={[caption, { marginBottom: space.sm }]}>{row.label}</Text>
                    <View testID={`conflict-values-${row.label}`} style={stacked ? styles.stacked : styles.columns}>
                      <View style={stacked ? undefined : styles.column}>
                        {stacked && <Text style={caption}>Latest saved</Text>}
                        <Text accessibilityLabel={`${row.label}, latest saved: ${row.saved}`} style={[body, { color: tokens.text }]}>
                          {row.saved}
                        </Text>
                      </View>
                      <View style={stacked ? undefined : styles.column}>
                        {stacked && <Text style={caption}>With your changes</Text>}
                        <Text
                          accessibilityLabel={`${row.label}, with your changes: ${row.next}`}
                          style={[
                            body,
                            {
                              color: row.saved !== row.next ? tokens.accentInk : tokens.text,
                              fontFamily: row.saved !== row.next ? fontFamily.bodySemiBold : fontFamily.bodyMedium,
                            },
                          ]}
                        >
                          {row.next}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <Text style={[body, { marginTop: rows.length ? 0 : space.xl }]}>{guidance}</Text>
            <View style={{ gap: space.md, marginTop: space.xl }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue with my changes"
                onPress={() => onChoose(true)}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: tokens.accent, borderRadius: radius.full, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.buttonLabel, { color: tokens.onAccent }]}>Continue with my changes</Text>
                <ArrowRight size={18} color={tokens.onAccent} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onChoose(false)}
                style={({ pressed }) => [
                  styles.button,
                  { borderWidth: 1, borderColor: tokens.borderStrong, borderRadius: radius.full, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.buttonLabel, { color: tokens.text2 }]}>Use latest instead</Text>
              </Pressable>
            </View>
            <Text style={[caption, { textAlign: 'center', marginTop: space.lg }]}>Nothing will be saved until you confirm.</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  back: { width: 48, height: 48, marginLeft: -12, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  columns: { flexDirection: 'row', gap: 16 },
  column: { flex: 1, minWidth: 0 },
  stacked: { gap: 12 },
  button: {
    minHeight: 50,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonLabel: { fontFamily: fontFamily.bodySemiBold, fontSize: 15, textAlign: 'center', flexShrink: 1 },
})
