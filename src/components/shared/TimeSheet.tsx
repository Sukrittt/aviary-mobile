import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BottomSheet } from '@/src/components/shared/Modal'
import { SheetTitle } from '@/src/components/shared/SheetOption'
import { Button } from '@/src/components/ui/Button'
import { Wheel } from '@/src/components/ui/Wheel'
import { nowLocal, parseLocalDate } from '@/src/lib/date'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const HOURS = ['12', ...Array.from({ length: 11 }, (_, i) => String(i + 1))]
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
const PERIODS = ['am', 'pm']

/** Three wheels for a time on `date` (YYYY-MM-DD). Hands back a device-local timestamp; a time still to come can't be picked, same as the calendar. */
export function TimeSheet({ visible, date, timestamp, onPick, onClose }: {
  visible: boolean
  date: string
  /** Where the wheels start. */
  timestamp: string
  onPick: (timestamp: string) => void
  onClose: () => void
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <TimeForm date={date} timestamp={timestamp} onPick={onPick} onClose={onClose} />
    </BottomSheet>
  )
}

// Its own component so the wheels start over from `timestamp` each time the sheet opens.
function TimeForm({ date, timestamp, onPick, onClose }: { date: string; timestamp: string; onPick: (timestamp: string) => void; onClose: () => void }) {
  const { tokens } = useTheme()
  const start = new Date(timestamp)
  const [now] = useState(() => Date.now())
  const [hour, setHour] = useState(start.getHours() % 12)
  const [minute, setMinute] = useState(start.getMinutes())
  const [period, setPeriod] = useState(start.getHours() >= 12 ? 1 : 0)
  const at = parseLocalDate(date)
  at.setHours(hour + period * 12, minute, 0, 0)
  const ahead = at.getTime() > now
  return (
    <>
      <SheetTitle>Time</SheetTitle>
      <View style={styles.wheels}>
        <Wheel loop items={HOURS} index={hour} onChange={setHour} accessibilityLabel="Hour" />
        <Wheel loop items={MINUTES} index={minute} onChange={setMinute} accessibilityLabel="Minute" />
        <Wheel items={PERIODS} index={period} onChange={setPeriod} accessibilityLabel="am or pm" />
      </View>
      {ahead && <Text style={[styles.hint, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>{"That time hasn't happened yet."}</Text>}
      <Button
        label="Done"
        disabled={ahead}
        style={styles.done}
        onPress={() => {
          onPick(nowLocal(at).timestamp)
          onClose()
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  wheels: { flexDirection: 'row', gap: 8 },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 12 },
  done: { marginTop: 16 },
})
