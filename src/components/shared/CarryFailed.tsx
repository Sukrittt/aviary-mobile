import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

/** Shown instead of a money screen when last month's carry didn't load: every
 * balance would be off without it, so the screen doesn't act on a guess. */
export function CarryFailed() {
  const { tokens, type, space } = useTheme()
  const router = useRouter()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg, backgroundColor: tokens.bg }}>
      <Text accessibilityRole="alert" style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body, textAlign: 'center' }}>
        {"Couldn't load your balances. Check your connection and try again."}
      </Text>
      <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
        <Text style={{ color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>Close</Text>
      </Pressable>
    </View>
  )
}
