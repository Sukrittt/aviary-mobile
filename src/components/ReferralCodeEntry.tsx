import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { APPLIED_COPY, APPLY_ERROR_COPY, applyReferralCode, referralsKey, type ReferralSummary } from '@/src/api/referrals'

/** "Got a code from a friend?": a friend's or a creator's code, in the first 7 days. Twin of Web's ReferralCodeEntry. */
export function ReferralCodeEntry() {
  const { tokens } = useTheme()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit() {
    if (busy || code.length < 3) return
    setBusy(true)
    const err = await applyReferralCode(code)
    setBusy(false)
    setMessage(err ? { ok: false, text: APPLY_ERROR_COPY[err] } : { ok: true, text: APPLIED_COPY })
    // Patch, don't refetch: a fresh summary says canEnterCode false, and the
    // screen would drop this form along with its confirmation.
    if (!err) queryClient.setQueryData<ReferralSummary>(referralsKey, (d) => d && { ...d, referredBy: code })
  }

  if (message?.ok) {
    return <Text accessibilityRole="text" style={[styles.msg, { color: tokens.text, fontFamily: fontFamily.bodyMedium }]}>{message.text}</Text>
  }
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Got a code from a friend?</Text>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Got a code from a friend?"
          value={code}
          onChangeText={(v) => { setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)); setMessage(null) }}
          placeholder="Code"
          placeholderTextColor={tokens.text3}
          autoCapitalize="characters"
          autoCorrect={false}
          onSubmitEditing={submit}
          style={[styles.input, { backgroundColor: tokens.inputBg, borderColor: message ? tokens.coral : tokens.border, color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={submit}
          disabled={busy || code.length < 3}
          style={[styles.btn, { borderColor: tokens.borderStrong, opacity: busy || code.length < 3 ? 0.5 : 1 }]}
        >
          <Text style={[styles.btnText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{busy ? 'Applying…' : 'Apply'}</Text>
        </Pressable>
      </View>
      {message && <Text accessibilityRole="alert" style={[styles.msg, { color: tokens.coral, fontFamily: fontFamily.bodyMedium }]}>{message.text}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 14, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, letterSpacing: 2 },
  btn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, justifyContent: 'center' },
  btnText: { fontSize: 14 },
  msg: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
})
