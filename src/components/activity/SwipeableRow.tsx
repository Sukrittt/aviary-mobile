import { useRef } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, { Extrapolation, interpolate, interpolateColor, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'

const ACTION_WIDTH = 84
const MIN_RADIUS = 14
const MAX_RADIUS = 30

function Action({
  icon,
  color,
  progress,
  onPress,
}: {
  icon: string
  color: string
  progress: SharedValue<number>
  onPress: () => void
}) {
  // backgroundColor is driven by progress (transparent at rest, opaque once revealed) rather
  // than a static color — the panel is otherwise always-opaque behind the row, and a whole-screen
  // opacity fade (tab switch) alpha-blends that opaque color through the row's front content.
  const boxStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(progress.value, [0, 1], [MIN_RADIUS, MAX_RADIUS], Extrapolation.CLAMP),
    backgroundColor: interpolateColor(progress.value, [0, 1], [`${color}00`, color]),
  }))
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP) }],
  }))
  return (
    <Animated.View style={[styles.action, boxStyle]}>
      <Pressable style={styles.actionPress} onPress={onPress}>
        <Animated.Text style={[styles.actionIcon, iconStyle]}>{icon}</Animated.Text>
      </Pressable>
    </Animated.View>
  )
}

export function SwipeableRow({
  children,
  onDelete,
  onEdit,
  onOpen,
  rowKey,
  enabled = true,
}: {
  children: React.ReactNode
  onDelete: () => void
  onEdit: () => void
  onOpen?: (key: string, close: () => void, reset: () => void) => void
  rowKey?: string
  // Off while multi-selecting; kept mounted so the row's select tick can animate.
  enabled?: boolean
}) {
  const { tokens } = useTheme()
  const ref = useRef<SwipeableMethods>(null)

  return (
    <Swipeable
      ref={ref}
      enabled={enabled}
      friction={2}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      dragOffsetFromLeft={24}
      dragOffsetFromRight={-24}
      onSwipeableWillOpen={() =>
        onOpen?.(
          rowKey ?? '',
          () => ref.current?.close(),
          () => ref.current?.reset(),
        )
      }
      renderLeftActions={(progress, _translation, swipeable: SwipeableMethods) => (
        <Action
          icon="✏️"
          color={tokens.accentInk}
          progress={progress}
          onPress={() => {
            swipeable.close()
            onEdit()
          }}
        />
      )}
      renderRightActions={(progress, _translation, swipeable: SwipeableMethods) => (
        <Action
          icon="🗑️"
          color={tokens.coral}
          progress={progress}
          onPress={() => {
            swipeable.close()
            onDelete()
          }}
        />
      )}
    >
      {children}
    </Swipeable>
  )
}

const styles = StyleSheet.create({
  action: { width: ACTION_WIDTH, margin: 4, overflow: 'hidden' },
  actionPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { fontSize: 15 },
})
