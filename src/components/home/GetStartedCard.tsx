import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Reanimated, { FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated'
import { Check, ChevronRight, CirclePlus, Compass, WalletCards, type LucideIcon } from 'lucide-react-native'
import { Card } from '@/src/components/ui/Card'
import { Icon } from '@/src/components/shared/Icon'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

type Props = {
  incomeDone: boolean
  manualTransactionDone: boolean
  guidedTourDone: boolean
  onAddIncome: () => void
  onAddTransaction: () => void
  onTakeTour: () => void
  onSkip: () => void
}

type Step = { key: string; icon: LucideIcon; label: string; hint: string; done: boolean; onPress?: () => void }

/**
 * A short, finite runway into the product. Setup is complete before Home is
 * reachable, but it can skip income, so the first step stays open until the
 * envelopes have money to hold. The other two milestones are server-owned and
 * survive devices. Skipping is a per-device choice, owned by the caller.
 */
export function GetStartedCard({
  incomeDone,
  manualTransactionDone,
  guidedTourDone,
  onAddIncome,
  onAddTransaction,
  onTakeTour,
  onSkip,
}: Props) {
  const { tokens, radius, space, type } = useTheme()

  const steps: Step[] = [
    incomeDone
      ? { key: 'budget', icon: WalletCards, label: 'Set up your budget', hint: 'Your envelopes are ready', done: true }
      : {
          key: 'budget',
          icon: WalletCards,
          label: 'Add your income',
          hint: 'Give your envelopes money to hold',
          done: false,
          onPress: onAddIncome,
        },
    {
      key: 'transaction',
      icon: CirclePlus,
      label: 'Add a manual transaction',
      hint: 'Log one expense by hand',
      done: manualTransactionDone,
      onPress: onAddTransaction,
    },
    {
      key: 'tour',
      icon: Compass,
      label: 'Take a guided tour',
      hint: 'See where everything lives',
      done: guidedTourDone,
      onPress: onTakeTour,
    },
  ]
  const completeCount = steps.filter((s) => s.done).length
  const nextKey = steps.find((s) => !s.done)?.key

  return (
    <Card elevated={false} style={{ padding: space.md, gap: space.md }}>
      <View style={styles.headingRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }}>Get started</Text>
          <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>
            Three small steps, then this card gets out of your way.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip getting started"
          onPress={onSkip}
          hitSlop={10}
          style={({ pressed }) => [styles.skip, { backgroundColor: tokens.inputBg, opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyExtraBold, fontSize: type.micro }}>Skip</Text>
        </Pressable>
      </View>

      <View
        style={styles.progressRow}
        accessible
        accessibilityLabel={`${completeCount} of ${steps.length} getting started steps complete`}
      >
        <View style={styles.segments}>
          {steps.map((s, i) => (
            <Segment key={s.key} filled={s.done} index={i} track={tokens.inputBg} fill={tokens.accent} />
          ))}
        </View>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyExtraBold, fontSize: type.micro }}>
          {completeCount}/{steps.length}
        </Text>
      </View>

      <View style={{ gap: space.xs }}>
        {steps.map((s, i) => (
          <Reanimated.View key={s.key} entering={FadeInDown.delay(140 + i * 70).springify().damping(20).stiffness(220)}>
            <StepRow step={s} upNext={s.key === nextKey} radius={radius.md} />
          </Reanimated.View>
        ))}
      </View>
    </Card>
  )
}

/** One third of the progress track; fills with a spring, staggered on reveal. */
function Segment({ filled, index, track, fill }: { filled: boolean; index: number; track: string; fill: string }) {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withDelay(220 + index * 90, withSpring(filled ? 1 : 0, { damping: 22, stiffness: 180 }))
  }, [filled, index, progress])

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }))

  return (
    <View style={[styles.segment, { backgroundColor: track }]}>
      <Reanimated.View style={[styles.segmentFill, { backgroundColor: fill }, fillStyle]} />
    </View>
  )
}

function StepRow({ step, upNext, radius }: { step: Step; upNext: boolean; radius: number }) {
  const { tokens, space, type } = useTheme()
  const { done } = step

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: done }}
      accessibilityLabel={`${step.label}${done ? ', complete' : ''}`}
      disabled={done}
      onPress={step.onPress}
      style={({ pressed }) => [
        styles.step,
        {
          backgroundColor: done ? 'transparent' : tokens.inputBg,
          borderColor: upNext ? tokens.accentSoft : 'transparent',
          borderRadius: radius,
          paddingHorizontal: space.sm + 2,
          paddingVertical: space.sm,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View
        style={[
          styles.badge,
          { backgroundColor: done ? tokens.mintSoft : upNext ? tokens.accentInk : tokens.card },
        ]}
      >
        <Icon icon={done ? Check : step.icon} size={16} color={done ? tokens.mint : upNext ? tokens.onAccent : tokens.text2} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          style={{
            color: done ? tokens.text3 : tokens.text,
            fontFamily: done ? fontFamily.bodySemiBold : fontFamily.bodyExtraBold,
            fontSize: type.caption,
          }}
        >
          {step.label}
        </Text>
        <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>
          {done ? 'Done' : step.hint}
        </Text>
      </View>
      {!done && <Icon icon={ChevronRight} size={17} color={upNext ? tokens.accentInk : tokens.text3} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  skip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  segments: { flex: 1, flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 6, borderRadius: 99, overflow: 'hidden' },
  segmentFill: { height: '100%', borderRadius: 99 },
  step: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1 },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
})
