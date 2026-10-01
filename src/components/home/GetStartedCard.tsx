import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Check, ChevronRight, CirclePlus, Compass, WalletCards, type LucideIcon } from 'lucide-react-native'
import { Card } from '@/src/components/ui/Card'
import { Icon } from '@/src/components/shared/Icon'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

type Props = {
  manualTransactionDone: boolean
  guidedTourDone: boolean
  onAddTransaction: () => void
  onTakeTour: () => void
}

/**
 * A short, finite runway into the product. Setup is complete before Home is
 * reachable; the other two milestones are server-owned and survive devices.
 */
export function GetStartedCard({ manualTransactionDone, guidedTourDone, onAddTransaction, onTakeTour }: Props) {
  const { tokens, radius, space, type } = useTheme()
  const completeCount = 1 + Number(manualTransactionDone) + Number(guidedTourDone)

  return (
    <Card elevated={false} style={{ padding: space.md, gap: space.md }}>
      <View style={styles.headingRow}>
        <View style={{ gap: 2 }}>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }}>Get started</Text>
          <Text style={{ color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro }}>
            Three small steps, then this card gets out of your way.
          </Text>
        </View>
        <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyExtraBold, fontSize: type.micro }}>{completeCount}/3</Text>
      </View>

      <View style={[styles.track, { backgroundColor: tokens.inputBg }]}>
        <View
          accessibilityLabel={`${completeCount} of 3 getting started steps complete`}
          style={[styles.fill, { backgroundColor: tokens.accent, width: `${(completeCount / 3) * 100}%` }]}
        />
      </View>

      <View style={{ gap: space.xs }}>
        <StepRow
          icon={CirclePlus}
          label="Add a manual transaction"
          done={manualTransactionDone}
          onPress={onAddTransaction}
          radius={radius.md}
        />
        <StepRow icon={WalletCards} label="Set up your budget" done radius={radius.md} />
        <StepRow icon={Compass} label="Take a guided tour" done={guidedTourDone} onPress={onTakeTour} radius={radius.md} />
      </View>
    </Card>
  )
}

function StepRow({
  icon,
  label,
  done,
  onPress,
  radius,
}: {
  icon: LucideIcon
  label: string
  done: boolean
  onPress?: () => void
  radius: number
}) {
  const { tokens, space, type } = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: done }}
      accessibilityLabel={`${label}${done ? ', complete' : ''}`}
      disabled={done}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        {
          backgroundColor: done ? tokens.mintSoft : tokens.inputBg,
          borderRadius: radius,
          paddingHorizontal: space.md,
          paddingVertical: space.sm + 2,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <Icon icon={icon} size={18} color={done ? tokens.mint : tokens.accentInk} />
      <Text
        style={[
          styles.stepLabel,
          {
            color: done ? tokens.text3 : tokens.text,
            fontFamily: done ? fontFamily.bodyMedium : fontFamily.bodyExtraBold,
            fontSize: type.caption,
            textDecorationLine: done ? 'line-through' : 'none',
          },
        ]}
      >
        {label}
      </Text>
      <Icon icon={done ? Check : ChevronRight} size={17} color={done ? tokens.mint : tokens.text3} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  track: { height: 5, borderRadius: 99, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99 },
  step: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepLabel: { flex: 1 },
})
