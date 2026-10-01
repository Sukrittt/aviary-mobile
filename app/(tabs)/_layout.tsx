import { Tabs } from 'expo-router/js-tabs'
import { View } from 'react-native'

import { NavBackdrop } from '@/src/components/nav/FloatingNav'
import { useTheme } from '@/src/theme/ThemeProvider'
import { useHabitNudges } from '@/src/hooks/useHabitNudges'

export default function TabsLayout() {
  const { tokens } = useTheme()
  useHabitNudges()

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={() => null}
        screenOptions={{ headerShown: false, animation: 'fade', sceneStyle: { backgroundColor: tokens.bg } }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="activity" />
        <Tabs.Screen name="envelopes" />
        <Tabs.Screen name="more" />
      </Tabs>
      <NavBackdrop />
    </View>
  )
}
