import { useEffect, useState } from 'react'
import { Pressable, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const RESEND_SECONDS = 30

/** `onResend` resolves true when the code went out; false or a throw means it didn't. */
export function ResendTimer({ onResend }: { onResend: () => Promise<boolean> }) {
  const { tokens } = useTheme()
  const [seconds, setSeconds] = useState(RESEND_SECONDS)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (seconds <= 0) return
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds])

  const handlePress = () => {
    if (seconds > 0) return
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
    <Pressable onPress={handlePress} disabled={seconds > 0} hitSlop={8}>
      <Text style={[styles.text, { color: seconds > 0 ? tokens.text3 : tokens.accent, fontFamily: fontFamily.bodySemiBold }]}>
        {seconds > 0 ? `Resend code in ${seconds}s` : failed ? "Couldn't send. Try again" : "Didn't get it? Resend now"}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  text: { fontSize: 13, marginTop: 14 },
})
