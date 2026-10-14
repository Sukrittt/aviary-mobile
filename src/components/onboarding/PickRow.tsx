import { useEffect, useRef } from 'react'
import { TextInput, Pressable, StyleSheet } from 'react-native'
import { Check } from '@/src/components/shared/icons'
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { CategoryIconPicker } from '@/src/components/shared/CategoryIconPicker'
import { categoryTint } from '@/src/lib/emoji'
import type { CategoryIconKey } from '@/src/lib/categoryIcons'

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable)

// SetupWizard.dc.html:301-304 — the group/category row: icon picker tile,
// name input, on/off toggle. Shared by the groups and categories steps.
export function PickRow({
  icon,
  name,
  on,
  placeholder,
  onPickIcon,
  onChangeName,
  onToggle,
}: {
  icon: CategoryIconKey
  name: string
  on: boolean
  placeholder: string
  onPickIcon: (icon: CategoryIconKey) => void
  onChangeName: (name: string) => void
  onToggle: () => void
}) {
  const { tokens, motion } = useTheme()
  const reduceMotion = useReducedMotion()
  const mounted = useRef(false)
  const rowScale = useSharedValue(1)
  const toggleScale = useSharedValue(1)
  const checkProgress = useSharedValue(on ? 1 : 0)
  const tapSpring = { duration: motion.fast, dampingRatio: 1 } as const

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }

    checkProgress.value = withTiming(on ? 1 : 0, {
      duration: motion.fast,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
    })
  }, [checkProgress, motion.fast, on])

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : rowScale.value }],
  }))
  const toggleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : toggleScale.value }],
  }))
  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkProgress.value,
    transform: [{ scaleX: reduceMotion ? 1 : checkProgress.value }],
  }))

  return (
    <Reanimated.View
      style={[
        styles.row,
        { backgroundColor: on ? tokens.card : 'transparent', borderColor: on ? tokens.accent : tokens.border },
        rowStyle,
      ]}
    >
      <CategoryIconPicker value={icon} onChange={onPickIcon} tint={categoryTint(name, tokens)}>
      <TextInput
        value={name}
        onChangeText={onChangeName}
        placeholder={placeholder}
        placeholderTextColor={tokens.text3}
        style={[styles.nameInput, { color: on ? tokens.text : tokens.text3, fontFamily: fontFamily.bodyBold }]}
      />
      <AnimatedPressable
        accessibilityLabel={`${on ? 'Deselect' : 'Select'} ${name || placeholder}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {})
          onToggle()
        }}
        onPressIn={() => {
          if (reduceMotion) return
          rowScale.value = withSpring(0.985, tapSpring)
          toggleScale.value = withSpring(0.9, tapSpring)
        }}
        onPressOut={() => {
          if (reduceMotion) {
            rowScale.value = 1
            toggleScale.value = 1
            return
          }
          rowScale.value = withSpring(1, tapSpring)
          toggleScale.value = withSpring(1, tapSpring)
        }}
        style={[
          styles.check,
          { borderColor: on ? tokens.accent : tokens.borderStrong, backgroundColor: on ? tokens.accent : 'transparent' },
          toggleStyle,
        ]}
      >
        <Reanimated.View testID="pick-row-check-icon" accessible={false} style={[styles.checkIcon, checkStyle]}>
          <Check size={16} color={tokens.onAccent} weight="bold" />
        </Reanimated.View>
      </AnimatedPressable>
      </CategoryIconPicker>
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 11, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1.5 },
  nameInput: { flex: 1, fontSize: 14, paddingVertical: 6, paddingHorizontal: 2 },
  check: { alignSelf: 'center', width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkIcon: { width: 16, height: 16, transformOrigin: 'left' },
})
