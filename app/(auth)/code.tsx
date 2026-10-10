import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, View, Text, Pressable, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import Svg, { Path } from 'react-native-svg'
import { ArrowLeft } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { sendMagicAuthCode, verifyMagicAuthCode } from '@/src/api/magicAuth'
import { resendEmailCode, verifyEmailChange } from '@/src/api/account'
import { CodeBoxes } from '@/src/components/auth/CodeBoxes'
import { Numpad } from '@/src/components/ui/Numpad'
import { ResendTimer } from '@/src/components/auth/ResendTimer'
import { Icon } from '@/src/components/shared/Icon'
import { userKey } from '@/src/hooks/useUser'
import { track } from '@/src/lib/analytics'

const CHECK_PATH_LENGTH = 19.8
const AnimatedPath = Animated.createAnimatedComponent(Path)

// Mirrors web's success row: mint checkPop badge (.4s cubic-bezier(.34,1.56,.64,1)),
// checkStroke draw (.32s ease-out, 100ms delay), text via successRise (.3s ease-out).
function VerifiedRow({ tokens }: { tokens: { mint: string; onAccent: string } }) {
  const badgeScale = useRef(new Animated.Value(0.4)).current
  const badgeOpacity = useRef(new Animated.Value(0)).current
  const checkDashoffset = useRef(new Animated.Value(CHECK_PATH_LENGTH)).current
  const rowOpacity = useRef(new Animated.Value(0)).current
  const rowTranslateY = useRef(new Animated.Value(10)).current

  useEffect(() => {
    Animated.timing(rowOpacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }).start()
    Animated.timing(rowTranslateY, { toValue: 0, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }).start()
    Animated.timing(badgeOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start()
    Animated.sequence([
      Animated.timing(badgeScale, { toValue: 1.14, duration: 220, easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true }),
      Animated.timing(badgeScale, { toValue: 1, duration: 180, easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true }),
    ]).start()
    Animated.timing(checkDashoffset, { toValue: 0, duration: 320, delay: 100, easing: Easing.out(Easing.ease), useNativeDriver: false }).start()
  }, [badgeOpacity, badgeScale, checkDashoffset, rowOpacity, rowTranslateY])

  return (
    <Animated.View style={[styles.verifiedRow, { opacity: rowOpacity, transform: [{ translateY: rowTranslateY }] }]}>
      <Animated.View style={[styles.verifiedBadge, { backgroundColor: tokens.mint, opacity: badgeOpacity, transform: [{ scale: badgeScale }] }]}>
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
          <AnimatedPath
            d="M5 13l4 4L19 7"
            stroke={tokens.onAccent}
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[CHECK_PATH_LENGTH, CHECK_PATH_LENGTH]}
            strokeDashoffset={checkDashoffset}
          />
        </Svg>
      </Animated.View>
      <Text style={[styles.verifiedText, { color: tokens.mint, fontFamily: fontFamily.bodyExtraBold }]}>Code verified. Signing you in…</Text>
    </Animated.View>
  )
}

// Mirrors web's @keyframes greenVeil: opacity 0 -> 1 (at 30%) -> 0, .9s ease-out.
function GreenVeil({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 270, easing: Easing.ease, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 630, easing: Easing.ease, useNativeDriver: true }),
    ]).start()
  }, [opacity])
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity }]} />
}

// Screen 3 (mockup: isCode). Custom numpad is a deliberate mockup choice, not
// the system keyboard. Auto-verifies once 6 digits are in, mirroring the
// mockup's pressKey auto-advance. Also reused for confirming an email change
// from Account & security (`?mode=change-email`): same numpad, a different
// verify call and a different destination on success.
export default function CodeScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const qc = useQueryClient()
  const { email: emailParam, mode } = useLocalSearchParams<{ email: string; mode?: string }>()
  const email = typeof emailParam === 'string' ? emailParam : ''
  const isChangeEmail = mode === 'change-email'
  const shake = useRef(new Animated.Value(0)).current

  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Mirrors web's @keyframes shakeRow: 0%,100%=0, 12%=-9, 28%=8, 45%=-6,
  // 62%=4, 80%=-2, .5s cubic-bezier(.36,.07,.19,.97).
  const triggerShake = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
    shake.setValue(0)
    const easing = Easing.bezier(0.36, 0.07, 0.19, 0.97)
    const steps: [number, number][] = [
      [-9, 60],
      [8, 80],
      [-6, 85],
      [4, 85],
      [-2, 90],
      [0, 100],
    ]
    Animated.sequence(
      steps.map(([v, duration]) => Animated.timing(shake, { toValue: v, duration, easing, useNativeDriver: true })),
    ).start()
  }

  // Cleared only on unmount, so a verify that's still in flight when the
  // screen is left (back button, or the change-email success redirect) can't
  // set state on a gone component.
  const cancelledRef = useRef(false)
  useEffect(() => () => {
    cancelledRef.current = true
  }, [])

  function runVerify(codeToVerify: string) {
    setPending(true)
    setError('')
    const verify = isChangeEmail ? verifyEmailChange(codeToVerify) : verifyMagicAuthCode(email, codeToVerify)
    verify.then((ok) => {
      if (cancelledRef.current) return
      setPending(false)
      if (ok) {
        if (!isChangeEmail) track('sign_in_completed', { method: 'email' })
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        setDone(true)
      } else {
        if (!isChangeEmail) track('sign_in_failed', { method: 'email', reason: 'wrong_code' })
        setError('Wrong or expired code.')
        setCode('')
        triggerShake()
      }
    }).catch(() => {
      // Transport failure (verifyEmailChange goes through apiFetch, which
      // throws). Not the user's typo, so no wrong_code event and no shake.
      if (cancelledRef.current) return
      setPending(false)
      setError("Couldn't check the code. Check your connection and try again.")
      setCode('')
    })
  }

  // A plain sign-in needs no navigation: persisting the session flips the root
  // layout's guards and the signed-in screens replace this one. Only the
  // change-email flow, which starts and ends signed in, has somewhere to go.
  useEffect(() => {
    if (!done || !isChangeEmail) return
    void qc.invalidateQueries({ queryKey: userKey })
    const timer = setTimeout(() => router.replace('/account/security'), 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
      <Pressable
        onPress={() =>
          isChangeEmail
            ? router.replace({ pathname: '/(auth)/email', params: { mode: 'change-email' } })
            : router.replace('/(auth)/email')
        }
        hitSlop={12}
        style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}
      >
        <Icon icon={ArrowLeft} size={20} color={tokens.text} />
      </Pressable>

      <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Check your inbox</Text>
      <Text style={[styles.subtitle, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
        Code sent to <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyBold }}>{email}</Text>
      </Text>

      <Animated.View style={{ transform: [{ translateX: shake }], marginTop: 26 }}>
        <CodeBoxes code={code} bad={error !== ''} ok={done} />
      </Animated.View>

      {done ? (
        <VerifiedRow tokens={tokens} />
      ) : (
        <>
          {error !== '' && (
            <Text style={[styles.error, { color: tokens.coral, fontFamily: fontFamily.bodyMedium }]}>{error}</Text>
          )}
          <ResendTimer onResend={() => void (isChangeEmail ? resendEmailCode() : sendMagicAuthCode(email)).catch(() => {})} />
        </>
      )}

      <View style={{ flex: 1 }} />

      {!done && (
        <Numpad
          disabled={pending}
          onDigit={(d) => {
            if (code.length >= 6) return
            const next = code + d
            setCode(next)
            if (next.length === 6) runVerify(next)
          }}
          onBackspace={() => setCode((c) => c.slice(0, -1))}
          onClear={() => setCode('')}
        />
      )}

      {done && <GreenVeil color={tokens.mintSoft} />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, marginTop: 26 },
  subtitle: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  error: { fontSize: 13, marginTop: 10 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  verifiedBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  verifiedText: { fontSize: 13 },
})
