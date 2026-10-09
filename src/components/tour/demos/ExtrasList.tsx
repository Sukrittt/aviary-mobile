import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import Reanimated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { EXTRAS } from '@/src/components/tour/content'

const SPRING = { damping: 90, stiffness: 900 }
const TRANSITION = LinearTransition.springify().damping(SPRING.damping).stiffness(SPRING.stiffness)

/** Chapter 6: the rest of the app, one accordion row each. */
export function ExtrasList({ onComplete }: { onComplete: () => void }) {
  const { space } = useTheme()
  const [open, setOpen] = useState<Record<number, boolean>>({})

  function toggle(index: number) {
    const next = { ...open }
    if (next[index]) delete next[index]
    else next[index] = true
    setOpen(next)
    if (Object.keys(next).length >= 2) onComplete()
  }

  return (
    <View style={{ gap: space.sm }}>
      {EXTRAS.map((extra, index) => (
        <ExtraRow key={extra.name} extra={extra} isOpen={!!open[index]} onPress={() => toggle(index)} />
      ))}
    </View>
  )
}

function ExtraRow({
  extra,
  isOpen,
  onPress,
}: {
  extra: (typeof EXTRAS)[number]
  isOpen: boolean
  onPress: () => void
}) {
  const { tokens, radius, space, type } = useTheme()
  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withSpring(isOpen ? '45deg' : '0deg', SPRING) }],
  }))

  return (
    <Reanimated.View
      layout={TRANSITION}
      style={[
        styles.row,
        {
          backgroundColor: isOpen ? tokens.accentSoft : tokens.cardSolid,
          borderColor: isOpen ? tokens.accent : tokens.border,
          borderRadius: radius.md,
          padding: space.md,
          gap: space.sm,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {})
          onPress()
        }}
        style={[styles.head, { gap: space.md }]}
      >
        <View style={[styles.tile, { backgroundColor: tokens.inputBg, borderRadius: radius.sm }]}>
          <Text style={{ fontSize: 16 }}>{extra.emoji}</Text>
        </View>
        <Text style={{ flex: 1, color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.body }}>
          {extra.name}
        </Text>
        <Reanimated.View style={plusStyle}>
          <Text style={{ color: isOpen ? tokens.accentInk : tokens.text3, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>
            +
          </Text>
        </Reanimated.View>
      </Pressable>
      {isOpen && (
        <Reanimated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)}>
          <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, lineHeight: 19 }}>
            {extra.desc}
          </Text>
        </Reanimated.View>
      )}
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  row: { borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center' },
  tile: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
})
