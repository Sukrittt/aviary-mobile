import { View } from 'react-native'
import { router, Stack } from 'expo-router'
import { EmptyState } from '@/src/components/shared/EmptyState'
import { useTheme } from '@/src/theme/ThemeProvider'

/** Any link expo-router can't match (old deep links, typos) lands here instead of "Unmatched Route". */
export default function NotFound() {
  const { tokens } = useTheme()
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: tokens.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <EmptyState
        mood="searching"
        title="This page flew off"
        description="We looked everywhere. Let's get you back home."
        action={{ label: 'Take me home', onPress: () => router.replace('/') }}
      />
    </View>
  )
}
