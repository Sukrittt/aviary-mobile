import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { ArrowLeft, ShieldCheck } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { sendMagicAuthCode } from '@/src/api/magicAuth'
import { changeEmail } from '@/src/api/account'
import { track } from '@/src/lib/analytics'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Screen 2 (mockup: isEmail). Validates, sends the code, then hands the email
// along as a route param to /(auth)/code — same param-passing convention as
// log-expense.tsx's edit mode. Also reused for changing the account email from
// Account & security (`?mode=change-email`): same address form, a different
// send call and destination screen.
export default function EmailScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const isChangeEmail = mode === 'change-email'

  const [email, setEmail] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const fail = (message: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
    setError(message)
  }

  const handleSend = async () => {
    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      setInvalid(true)
      return
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    setInvalid(false)
    setError('')
    setPending(true)

    if (isChangeEmail) {
      try {
        await changeEmail(trimmed)
        setPending(false)
        router.push({ pathname: '/(auth)/code', params: { email: trimmed, mode: 'change-email' } })
      } catch (err) {
        setPending(false)
        const msg = err instanceof Error ? err.message : ''
        fail(msg.includes('already in use') ? msg : 'Could not change email. Check your connection and try again.')
      }
      return
    }

    track('sign_in_started', { method: 'email' })
    const ok = await sendMagicAuthCode(trimmed).catch(() => null)
    setPending(false)
    if (ok === null) {
      track('sign_in_failed', { method: 'email', reason: 'code_send_failed' })
      return fail("Couldn't send the code. Check your connection and try again.")
    }
    if (!ok) {
      track('sign_in_failed', { method: 'email', reason: 'code_send_failed' })
      return fail('Could not send code. Check the address and try again.')
    }
    track('sign_in_code_sent')
    router.push({ pathname: '/(auth)/code', params: { email: trimmed } })
  }

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 }]}>
      <Pressable
        onPress={() => (isChangeEmail ? router.back() : router.replace('/(auth)/welcome'))}
        hitSlop={12}
        style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}
      >
        <Icon icon={ArrowLeft} size={20} color={tokens.text} />
      </Pressable>

      <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
        {isChangeEmail ? "What's your new email?" : "What's your email?"}
      </Text>
      <Text style={[styles.subtitle, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
        {isChangeEmail
          ? "We'll send a 6-digit code to confirm it's you."
          : "We'll send a 6-digit code. If you're new, this creates your account."}
      </Text>

      <TextInput
        value={email}
        onChangeText={(v) => {
          setEmail(v)
          setInvalid(false)
        }}
        placeholder="you@example.com"
        placeholderTextColor={tokens.text3}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={handleSend}
        style={[styles.input, { color: tokens.text, backgroundColor: tokens.inputBg, borderColor: tokens.borderStrong, fontFamily: fontFamily.bodyMedium }]}
      />

      {invalid && (
        <Text style={[styles.fieldError, { color: tokens.coral, fontFamily: fontFamily.bodyMedium }]}>
          Enter a valid email address.
        </Text>
      )}
      {error !== '' && (
        <Text style={[styles.fieldError, { color: tokens.coral, fontFamily: fontFamily.bodyMedium }]}>{error}</Text>
      )}

      <Pressable
        onPress={handleSend}
        disabled={pending || !email}
        style={[styles.sendButton, { backgroundColor: tokens.accent, opacity: pending || !email ? 0.6 : 1 }]}
      >
        <Text style={[styles.sendText, { color: tokens.onAccent, fontFamily: fontFamily.displaySemiBold }]}>
          {pending ? 'Sending…' : 'Send code'}
        </Text>
      </Pressable>

      <View style={{ flex: 1 }} />

      <View style={[styles.noteCard, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
        <Icon icon={ShieldCheck} size={16} color={tokens.text2} />
        <Text style={[styles.noteText, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
          Passwords are gone. Sessions live on this device and you can revoke them any time from Account & security.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, marginTop: 26 },
  subtitle: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  input: { marginTop: 26, borderWidth: 1, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16, fontSize: 16 },
  fieldError: { fontSize: 13, marginTop: 10 },
  sendButton: { marginTop: 14, minHeight: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 15 },
  noteCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderWidth: 1, borderRadius: 18 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18 },
})
