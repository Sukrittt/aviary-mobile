import { useEffect, useState } from 'react'
import { Pressable, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const RESEND_SECONDS = 30

/** `onResend` resolves true when the code went out; false or a throw means it didn't.
 * `ready` skips the cooldown, for when the current code is known to be dead. */
export function ResendTimer({ onResend, ready = false }: { onResend: () => Promise<boolean>; ready?: boolean }) {
  const { tokens } = useTheme()
  const [seconds, setSeconds] = useState(RESEND_SECONDS)
  const [failed, setFailed] = useState(false)
  const left = ready ? 0 : seconds

  useEffect(() => {
    if (seconds <= 0) return
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds])

  const handlePress = () => {
    if (left > 0) return
    setFailed(false)
    setSeconds(RESEND_SECONDS)
    // Nothing went out, so drop the cooldown and let them retry right away.
    const fail = () => {
      setSeconds(0)
      setFailed(true)
    }
    onResend().then((ok) => {
      if (!ok) fail()
    }, fail)
  }

  return (
    <Pressable onPress={handlePress} disabled={left > 0} hitSlop={8}>
      <Text style={[styles.text, { color: left > 0 ? tokens.text3 : tokens.accent, fontFamily: fontFamily.bodySemiBold }]}>
        {left > 0 ? `Resend code in ${left}s` : failed ? "Couldn't send. Try again" : "Didn't get it? Resend now"}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  text: { fontSize: 13, marginTop: 14 },
})
