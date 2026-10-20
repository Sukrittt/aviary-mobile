import { Image, Text, View, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import type { BudgetMember } from '@/src/api/spaces'

export function initialOf(name: string | null | undefined): string {
  const first = [...(name ?? '').trim()][0]
  return first ? first.toUpperCase() : '?'
}

/** One person's face, or their initial when they have no photo. */
export function Avatar({ name, avatarUrl, size = 22 }: { name: string | null; avatarUrl: string | null; size?: number }) {
  const { tokens } = useTheme()
  const ring = { width: size, height: size, borderRadius: size / 2, borderColor: tokens.bg }
  if (avatarUrl) return <Image source={{ uri: avatarUrl }} style={[styles.ring, ring]} accessibilityIgnoresInvertColors />
  return (
    <View testID="avatar-initial" style={[styles.ring, ring, { backgroundColor: tokens.accent }]}>
      <Text style={{ color: tokens.onAccent, fontSize: Math.max(12, size * 0.5), fontFamily: fontFamily.bodyBold }}>{initialOf(name)}</Text>
    </View>
  )
}

/** Overlapping faces for a budget's members, up to `max`, then "+N". */
export function MemberAvatars({ members, max = 3, size = 22 }: { members: BudgetMember[]; max?: number; size?: number }) {
  const { tokens } = useTheme()
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  return (
    <View style={styles.row} accessibilityLabel={`${members.length} ${members.length === 1 ? 'person' : 'people'}`}>
      {shown.map((m, i) => (
        <View key={m.userId} style={{ marginLeft: i === 0 ? 0 : -size / 3 }}>
          <Avatar name={m.name} avatarUrl={m.avatarUrl} size={size} />
        </View>
      ))}
      {extra > 0 ? <Text style={[styles.extra, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>{`+${extra}`}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  ring: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  extra: { fontSize: 12, marginLeft: 4 },
})
