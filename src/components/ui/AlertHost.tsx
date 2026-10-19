import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BottomSheet } from '@/src/components/shared/Modal'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

export interface AlertButton {
  text: string
  style?: 'default' | 'cancel' | 'destructive'
  onPress?: () => void
}

interface AlertRequest {
  title: string
  message?: string
  buttons: AlertButton[]
  /** Not replaced by an ordinary alert while it's up, e.g. a screen's own
   *  "couldn't save" for the same failed request a moment later. */
  sticky?: boolean
}

const DEFAULT_BUTTONS: AlertButton[] = [{ text: 'OK' }]

// Module-level singleton so `Alert.alert(...)` is a drop-in replacement for
// react-native's own — call sites don't need a hook, a provider prop, or any
// wiring beyond swapping the import.
let listener: ((request: AlertRequest) => void) | null = null

export const Alert = {
  alert(title: string, message?: string, buttons: AlertButton[] = DEFAULT_BUTTONS, options?: { sticky?: boolean }) {
    listener?.({ title, message, buttons, sticky: options?.sticky })
  },
}

/** Mount once near the app root (inside ThemeProvider) — see app/_layout.tsx. */
export function AlertHost() {
  const { tokens } = useTheme()
  const [request, setRequest] = useState<AlertRequest | null>(null)

  useEffect(() => {
    listener = (next) => setRequest((prev) => (prev?.sticky && !next.sticky ? prev : next))
    return () => {
      listener = null
    }
  }, [])

  function handlePress(button: AlertButton) {
    setRequest(null)
    button.onPress?.()
  }

  return (
    <BottomSheet visible={request !== null} onClose={() => setRequest(null)}>
      {request ? (
        <>
          <Text style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
            {request.title}
          </Text>
          {request.message ? (
            <Text style={[styles.body, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
              {request.message}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            {request.buttons.map((button, index) => {
              const destructive = button.style === 'destructive'
              const cancel = button.style === 'cancel'
              return (
                <Pressable
                  key={index}
                  onPress={() => handlePress(button)}
                  style={[
                    styles.button,
                    { backgroundColor: destructive ? tokens.coral : cancel ? tokens.pillBg : tokens.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: cancel ? tokens.text2 : tokens.onAccent, fontFamily: fontFamily.bodyBold },
                    ]}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </>
      ) : null}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 18, marginBottom: 8 },
  body: { fontSize: 13, lineHeight: 18 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  button: { flex: 1, minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14 },
})
