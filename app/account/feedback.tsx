import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft, ImageSquare, X } from '@/src/components/shared/icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Alert } from '@/src/components/ui/AlertHost'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { Toggle } from '@/src/components/ui/Toggle'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useInstantSetting } from '@/src/hooks/useInstantSetting'
import { submitFeedback } from '@/src/api/feedback'
import { track } from '@/src/lib/analytics'
import { pickPhoto, type PickedPhoto } from '@/src/features/log-expense/ExpensePhotoField'

// A private bug report: posts to Web/app/api/feedback, which records it for
// the admin inbox with diagnostics and AI triage. Ideas go on the public
// board (app/account/ideas.tsx) instead.
export default function FeedbackScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const privacy = usePrivacy()
  const [hideAmounts, setHideAmounts] = useInstantSetting(privacy.hideAmounts, privacy.setHideAmounts)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [screenshot, setScreenshot] = useState<PickedPhoto | null>(null)

  const canSubmit = title.trim() !== '' && description.trim() !== ''

  useEffect(() => {
    if (!sent) return
    const timer = setTimeout(() => router.back(), 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent])

  async function handleSubmit() {
    if (!canSubmit || sending) return
    setSending(true)
    try {
      await submitFeedback('bug', title, description, screenshot ? { image: screenshot.base64, mimeType: screenshot.mimeType } : undefined)
      track('feedback_sent', { type: 'bug', screenshot: !!screenshot })
      setSent(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      Alert.alert(
        "Couldn't send that",
        message === 'rate_limited' ? "You've sent a few already. Try again later." : 'Check your connection and try again.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: tokens.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Report a bug</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What's broken?"
            maxLength={150}
            placeholderTextColor={tokens.text3}
            style={[styles.input, { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium }]}
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Details</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What happened, and what did you expect instead?"
            maxLength={4000}
            placeholderTextColor={tokens.text3}
            multiline
            numberOfLines={5}
            style={[
              styles.input,
              styles.textArea,
              { backgroundColor: tokens.inputBg, borderColor: tokens.border, color: tokens.text, fontFamily: fontFamily.bodyMedium },
            ]}
          />
          <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
            Only our team sees this. Leave out passwords or personal details.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Screenshot (optional)</Text>
          {screenshot ? (
            <View style={styles.thumbWrap}>
              <Image source={{ uri: screenshot.uri }} style={[styles.thumb, { borderColor: tokens.border }]} accessibilityLabel="Your screenshot" />
              <Pressable
                onPress={() => setScreenshot(null)}
                disabled={sending || sent}
                accessibilityRole="button"
                accessibilityLabel="Remove screenshot"
                hitSlop={8}
                style={[styles.thumbRemove, { backgroundColor: tokens.cardSolid, borderColor: tokens.borderStrong }]}
              >
                <X size={12} color={tokens.text} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={async () => setScreenshot((await pickPhoto('library')) ?? null)}
              accessibilityRole="button"
              style={[styles.attachButton, { backgroundColor: tokens.inputBg, borderColor: tokens.border }]}
            >
              <ImageSquare size={16} color={tokens.accentInk} />
              <Text style={[styles.attachText, { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }]}>Add a screenshot</Text>
            </Pressable>
          )}
          {/* Same switch as More's, so a screenshot taken after flipping it here is already blurred. */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Hide amounts</Text>
              <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
                Blurs your balances so they stay out of screenshots.
              </Text>
            </View>
            <Toggle value={hideAmounts} onValueChange={setHideAmounts} accessibilityLabel="Hide amounts" />
          </View>
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit || sending || sent}
          style={[styles.confirmButton, { backgroundColor: sent ? tokens.successBg : tokens.accent, opacity: !canSubmit || sending ? 0.5 : 1 }]}
        >
          {sent ? (
            <CheckIcon color={tokens.onSuccess} />
          ) : (
            <Text style={[styles.confirmText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>
              {sending ? 'Sending…' : 'Send report'}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19 },
  body: { padding: 20, gap: 16 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15 },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  attachButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  attachText: { fontSize: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  toggleLabel: { fontSize: 14 },
  thumbWrap: { alignSelf: 'flex-start' },
  thumb: { width: 72, height: 128, borderRadius: 10, borderWidth: 1 },
  thumbRemove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  confirmButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  confirmText: { fontSize: 16 },
})
