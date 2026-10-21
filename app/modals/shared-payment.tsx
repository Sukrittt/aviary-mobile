import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { LoadingCaption } from '@/src/components/shared/LoadingCaption'
import { readShare } from '@/src/features/share/readShare'
import { looksLogged, refNote } from '@/src/features/share/upiShare'
import { LOG_EXPENSE_PATH } from '@/src/features/log-expense/SubmitContext'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { track } from '@/src/lib/analytics'
import { setSharedPhoto, takePendingShare } from '@/src/lib/pendingShare'
import { useTheme } from '@/src/theme/ThemeProvider'

/**
 * A payment shared to Aviary from a UPI app, being read. Opens the normal
 * log sheet prefilled with what it found (amount, payee, date, category), so
 * logging it is one tap and anything can be changed first. Nothing is logged
 * without that tap. When it can't be read, the sheet opens with the
 * screenshot attached and the amount left for the user.
 */
export default function SharedPaymentScreen() {
  const { tokens } = useTheme()
  const router = useRouter()
  const recent = useRecentExpenses()
  const rows = useRef(recent.data)
  rows.current = recent.data
  // Taken and read once per screen, not per effect run: a remount must not lose the share or read it twice.
  const [share] = useState(takePendingShare)
  const [reading] = useState(() => (share ? readShare(share) : null))

  useEffect(() => {
    if (!share || !reading) {
      router.back()
      return
    }
    let live = true
    const kind = 'text' in share ? 'text' : 'image'
    void reading.then((result) => {
      if (!live) return
      if (!result.payment) {
        if (result.photo) setSharedPhoto(result.photo)
        track('share_read', { kind, read: false })
        router.replace({ pathname: LOG_EXPENSE_PATH, params: { shared: '1' } })
        return
      }
      const { payment } = result
      const dupe = result.loggedOnServer || looksLogged(rows.current ?? [], payment)
      track('share_read', { kind, read: true, dupe })
      router.replace({
        pathname: LOG_EXPENSE_PATH,
        params: {
          shared: '1',
          item: payment.payee,
          amountInr: String(payment.amount),
          ...(payment.date ? { date: payment.date } : {}),
          ...(payment.category ? { category: payment.category } : {}),
          ...(payment.ref ? { notes: refNote(payment.ref) } : {}),
          ...(dupe ? { dupe: '1' } : {}),
        },
      })
    })
    return () => { live = false }
  }, [router, share, reading])

  return (
    <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
      <LoadingCaption ordered phrases={['Reading your payment…', 'Finding who you paid…', "Checking it isn't logged already…", 'Almost there…']} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
})
