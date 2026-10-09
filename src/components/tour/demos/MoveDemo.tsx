import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import Reanimated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

import { SectionLabel, ResultCard } from '@/src/components/tour/parts'
import { MOVE_AMOUNT, MOVE_IN_ENVELOPE, MOVE_NEED, MOVE_SOURCES } from '@/src/components/tour/content'

/** Chapter 3: cover a shortfall by borrowing from an envelope with slack. */
export function MoveDemo({ onComplete }: { onComplete: () => void }) {
  const { formatCurrency } = useCurrency()

  const { tokens, radius, space, type } = useTheme()
  const [moved, setMoved] = useState<{ id: string; name: string; amount: number } | null>(null)

  const inEnvelope = MOVE_IN_ENVELOPE + (moved?.amount ?? 0)
  const short = Math.max(0, MOVE_NEED - inEnvelope)

  return (
    <View style={{ gap: space.md }}>
      <View
        style={[
          styles.dest,
          {
            backgroundColor: tokens.cardSolid,
            borderColor: tokens.border,
            borderRadius: radius.lg,
            padding: space.md,
            gap: space.md,
          },
        ]}
      >
        <View style={[styles.tile, { backgroundColor: tokens.accentSoft, borderRadius: radius.md }]}>
          <Text style={{ fontSize: 20 }}>💡</Text>
        </View>
        <View style={styles.body}>
          <Text style={[styles.kicker, { color: tokens.text2, fontFamily: fontFamily.bodyBold, fontSize: type.micro }]}>
            ELECTRICITY · {formatCurrency(MOVE_NEED)} DUE THE 5TH
          </Text>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }}>
            {formatCurrency(inEnvelope)} in the envelope
          </Text>
          <Text
            style={{
              color: short > 0 ? tokens.coral : tokens.mint,
              fontFamily: fontFamily.bodyBold,
              fontSize: type.micro,
            }}
          >
            {short > 0 ? `${formatCurrency(short)} short` : 'fully funded ✓'}
          </Text>
        </View>
      </View>

      <SectionLabel>{short > 0 ? 'BEST PLACES TO BORROW FROM' : 'WHERE IT CAME FROM'}</SectionLabel>

      {MOVE_SOURCES.map((source) => {
        const taken = moved?.id === source.id ? moved.amount : 0
        const isProtected = 'protected' in source && source.protected
        return (
          <SourceRow
            key={source.id}
            taken={taken}
            isProtected={!!isProtected}
            emoji={source.emoji}
            name={source.name}
            note={taken ? `Gave ${formatCurrency(taken)} · still fine for the month` : source.note}
            available={formatCurrency(source.available - taken)}
            onPress={() => {
              setMoved({ id: source.id, name: source.name, amount: Math.min(MOVE_AMOUNT, source.available) })
              onComplete()
            }}
          />
        )
      })}

      {moved && (
        <Reanimated.View entering={FadeIn.duration(200)}>
          <ResultCard tone="mint">
            <Text style={{ color: tokens.mint, fontFamily: fontFamily.displaySemiBold, fontSize: type.bodyLg }}>
              {formatCurrency(moved.amount)} moved from {moved.name}
            </Text>
            <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodySemiBold, fontSize: type.micro, lineHeight: 18 }}>
              No money left your bank. Only the plan changed, and that is the whole trick.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                setMoved(null)
              }}
              hitSlop={8}>
              <Text style={{ color: tokens.text2, fontFamily: fontFamily.bodyBold, fontSize: type.caption }}>Undo</Text>
            </Pressable>
          </ResultCard>
        </Reanimated.View>
      )}
    </View>
  )
}

/** Bounces the picked source, same shape as RolloverDemo.tsx's quiz-option bounce. */
function SourceRow({
  taken,
  isProtected,
  emoji,
  name,
  note,
  available,
  onPress,
}: {
  taken: number
  isProtected: boolean
  emoji: string
  name: string
  note: string
  available: string
  onPress: () => void
}) {
  const { tokens, radius, space, type } = useTheme()
  const scale = useSharedValue(1)

  useEffect(() => {
    if (!taken) return
    const bounce = Easing.bezier(0.34, 1.56, 0.64, 1)
    scale.value = withSequence(withTiming(1.03, { duration: 152, easing: bounce }), withTiming(1, { duration: 228, easing: bounce }))
    // Fires once per selection, not on every render while taken stays > 0.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taken])

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Reanimated.View style={style}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          Haptics.selectionAsync().catch(() => {})
          onPress()
        }}
        style={[
          styles.source,
          {
            backgroundColor: taken ? tokens.accentSoft : tokens.cardSolid,
            borderColor: taken ? tokens.accent : isProtected ? tokens.warn : tokens.border,
            borderRadius: radius.md,
            padding: space.md,
            gap: space.md,
          },
        ]}
      >
        <View style={[styles.tileSm, { backgroundColor: tokens.inputBg, borderRadius: radius.sm }]}>
          <Text style={{ fontSize: 16 }}>{emoji}</Text>
        </View>
        <View style={styles.body}>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: type.body }}>{name}</Text>
          <Text
            style={{
              color: taken ? tokens.accentInk : isProtected ? tokens.warnInk : tokens.text3,
              fontFamily: fontFamily.bodySemiBold,
              fontSize: type.micro,
            }}
          >
            {note}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.bodySemiBold, fontSize: type.body }}>{available}</Text>
          <Text style={[styles.kicker, { color: tokens.text3, fontFamily: fontFamily.bodyBold, fontSize: type.micro - 2 }]}>
            AVAILABLE
          </Text>
        </View>
      </Pressable>
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  dest: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  source: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  tile: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tileSm: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  right: { alignItems: 'flex-end', gap: 2 },
  kicker: { letterSpacing: 1 },
})
