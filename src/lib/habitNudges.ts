import { Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import * as TaskManager from 'expo-task-manager'
import { router } from 'expo-router'
import type * as NotificationsType from 'expo-notifications'
import { currentUserId, initAccessMode } from '@/src/api/accessMode'
import { mintExpensePayload } from '@/src/api/expenses'
import { readEncrypted, writeEncrypted } from '@/src/lib/encryptedStorage'
import { enqueue } from '@/src/lib/pendingExpenses'
import { flush } from '@/src/sync/flush'
import { track } from '@/src/lib/analytics'
import { formatMoney } from '@/src/lib/currencies'
import { readCurrencyPreference } from '@/src/lib/currencyPreference'
import { getNotifications } from '@/src/lib/notifications'
import { findHabits, planNudges, settleNudges, type Habit, type HabitState, type ScheduledNudge } from '@/src/lib/habits'
import { fetchNudgeCopy, type NudgeCopy } from '@/src/api/habitNudges'
import { toLocalDateString } from '@/src/lib/date'
import type { ExpenseRow } from '@/src/types'

/**
 * Local "Football time? Log it" nudges, scheduled on the device from the
 * habits in habits.ts. No server: the cron only runs once a day, and these
 * need to land at a time of day. Rescheduled from scratch on every refresh
 * (app open, any expense change), so a week without opening the app is the
 * longest they keep going on their own.
 */

const TASK = 'habit-nudge-action'
const STORE_PREFIX = 'mc-habit-nudges'
// A nudge gets this long to be acted on before a refresh counts it as ignored.
const GRACE_MS = 2 * 60 * 60 * 1000
// AI copy is fetched at most this many habits per refresh, and a failed one waits a day to retry.
const COPY_FETCHES = 5
const COPY_RETRY_MS = 24 * 60 * 60 * 1000
const FALLBACK_BODY = 'Log it while it\'s fresh. We filled in the usual.'

type Store = {
  enabled: boolean
  state: HabitState
  scheduled: ScheduledNudge[]
  handled: string[]
  /** AI-written copy per habit id, kept as long as the habit is. */
  copy: Record<string, NudgeCopy>
  /** When fetching a habit's copy last failed, so it isn't retried every app open. */
  copyFailedAt: Record<string, number>
}

/** What a nudge carries: enough to prefill log-expense or log it outright. */
export type NudgeData = {
  nudgeId: string
  habitId: string
  item: string
  category: string
  amountInr: number
  paymentMethod: string
}

const EMPTY: Store = { enabled: true, state: {}, scheduled: [], handled: [], copy: {}, copyFailedAt: {} }
const storeKey = (uid: string) => `${STORE_PREFIX}:${uid}`

async function readStore(uid: string): Promise<Store> {
  return { ...EMPTY, ...(await readEncrypted<Store>(storeKey(uid))) }
}

// Same single-flight chain as pendingExpenses.ts: a refresh racing a tap
// would otherwise clobber the other's read-modify-write.
let chain: Promise<unknown> = Promise.resolve()
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn)
  chain = result.catch(() => {})
  return result
}

function update(uid: string, fn: (s: Store) => Store | Promise<Store>): Promise<Store> {
  return serialize(async () => {
    const next = await fn(await readStore(uid))
    await writeEncrypted(storeKey(uid), next)
    return next
  })
}

/** Cancels every habit nudge the OS still holds, whoever's account scheduled it. */
export async function cancelHabitNudges(): Promise<void> {
  const Notifications = getNotifications()
  if (!Notifications) return
  const all = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(
    all.filter((n) => typeof n.content.data?.nudgeId === 'string').map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  )
}

/**
 * Settles what already fired, then replaces every scheduled habit nudge with
 * a fresh plan from `rows`. Never asks for permission: that's
 * registerForPushNotificationsAsync's job, at sign-in.
 */
export function refreshHabitNudges(rows: ExpenseRow[], now = new Date()): Promise<void> {
  const uid = currentUserId()
  const Notifications = getNotifications()
  if (!uid || !Notifications) return Promise.resolve()

  return update(uid, async (store) => {
    const cutoff = new Date(now.getTime() - GRACE_MS)
    const handled = new Set(store.handled)
    const state = settleNudges(store.scheduled, handled, store.state, rows, cutoff)
    // Fired but still inside the grace window: settle these next time.
    const waiting = store.scheduled.filter((n) => Date.parse(n.fireAt) > cutoff.getTime() && Date.parse(n.fireAt) <= now.getTime())
    const keep = (scheduled: ScheduledNudge[], copy = store.copy, copyFailedAt = store.copyFailedAt): Store => ({
      enabled: store.enabled,
      state,
      scheduled,
      handled: store.handled.filter((id) => scheduled.some((n) => n.id === id)),
      copy,
      copyFailedAt,
    })

    await cancelHabitNudges()
    if (!store.enabled || (await Notifications.getPermissionsAsync()).status !== 'granted') return keep(waiting)

    const habits = findHabits(rows, toLocalDateString(now))
    const plan = planNudges(habits, state, now, rows)
    const byId = new Map(habits.map((h) => [h.id, h]))
    const currency = await readCurrencyPreference()
    const { copy, copyFailedAt } = await withCopy(habits, store, now)

    // One category per habit: action button titles are fixed per category,
    // and "Log ₹200" has to name the amount.
    await Promise.all(
      habits.map((h, i) =>
        Notifications.setNotificationCategoryAsync(`habit-${i}`, [
          // iOS can't log from a terminated app without opening it, so the button opens it there.
          { identifier: 'log', buttonTitle: `Log ${formatMoney(h.amountInr, currency)}`, options: { opensAppToForeground: Platform.OS === 'ios' } },
          { identifier: 'skip', buttonTitle: 'Not this one', options: { opensAppToForeground: false } },
        ]),
      ),
    )

    const scheduled: ScheduledNudge[] = []
    for (const p of plan) {
      const habit = byId.get(p.habitId)!
      const nudgeId = Crypto.randomUUID()
      const data: NudgeData = {
        nudgeId,
        habitId: habit.id,
        item: habit.item,
        category: habit.category,
        amountInr: habit.amountInr,
        paymentMethod: habit.paymentMethod,
      }
      await Notifications.scheduleNotificationAsync({
        identifier: nudgeId,
        content: {
          ...copyFor(habit, copy[habit.id], p.date),
          data,
          categoryIdentifier: `habit-${habits.indexOf(habit)}`,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.fireAt },
      })
      scheduled.push({ id: nudgeId, habitId: habit.id, fireAt: p.fireAt.toISOString(), date: p.date })
    }
    if (scheduled.length) track('habit_nudges_scheduled', { count: scheduled.length, habits: habits.length })
    return keep([...waiting, ...scheduled], copy, copyFailedAt)
  }).then(() => undefined)
}

/** Fetches copy for habits that don't have it yet, and drops copy for habits that are gone. */
async function withCopy(habits: Habit[], store: Store, now: Date): Promise<Pick<Store, 'copy' | 'copyFailedAt'>> {
  const copy: Store['copy'] = {}
  const copyFailedAt: Store['copyFailedAt'] = {}
  for (const h of habits) {
    if (store.copy[h.id]) copy[h.id] = store.copy[h.id]
    else if (store.copyFailedAt[h.id] && now.getTime() - store.copyFailedAt[h.id] < COPY_RETRY_MS) copyFailedAt[h.id] = store.copyFailedAt[h.id]
  }
  const missing = habits.filter((h) => !copy[h.id] && !copyFailedAt[h.id]).slice(0, COPY_FETCHES)
  const fetched = await Promise.all(missing.map((h) => fetchNudgeCopy(h)))
  missing.forEach((h, i) => {
    const c = fetched[i]
    if (c) copy[h.id] = c
    else copyFailedAt[h.id] = now.getTime()
  })
  return { copy, copyFailedAt }
}

/** Rotates through a habit's body lines day by day; fixed copy until the AI copy arrives. */
function copyFor(habit: Habit, copy: NudgeCopy | undefined, date: string): { title: string; body: string } {
  if (!copy) return { title: `${habit.item} time?`, body: FALLBACK_BODY }
  const day = Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000)
  return { title: copy.title, body: copy.bodies[day % copy.bodies.length] }
}

export async function habitNudgesEnabled(): Promise<boolean> {
  const uid = currentUserId()
  return uid ? (await readStore(uid)).enabled : false
}

/** The settings switch. Turning it back on reschedules from `rows` right away. */
export async function setHabitNudgesEnabled(enabled: boolean, rows: ExpenseRow[]): Promise<void> {
  const uid = currentUserId()
  if (!uid) return
  await update(uid, (s) => ({ ...s, enabled }))
  track('habit_nudges_toggled', { enabled })
  await refreshHabitNudges(rows)
}

// A tap can reach us twice on Android (the background task and the response
// listener, when the app is alive). Only the first one does anything.
const claimed = new Set<string>()

async function claim(uid: string, nudgeId: string): Promise<boolean> {
  if (claimed.has(nudgeId)) return false
  claimed.add(nudgeId)
  let first = true
  await update(uid, (s) => {
    first = !s.handled.includes(nudgeId)
    return first ? { ...s, handled: [...s.handled, nudgeId] } : s
  })
  return first
}

/**
 * The "Log ₹200" button. Goes through the offline queue, so a dead network
 * just means it syncs on the next app open. The nudge id doubles as the
 * expense's client_id: a second delivery of the same tap is a server-side
 * replay, not a second row.
 */
async function quickLog(data: NudgeData, Notifications: typeof NotificationsType): Promise<void> {
  // Headless on Android: nothing has restored the session yet.
  if (!currentUserId()) await initAccessMode()
  const uid = currentUserId()
  if (!uid || !(await claim(uid, data.nudgeId))) return

  const payload = {
    ...mintExpensePayload({ item: data.item, amount_inr: String(data.amountInr), category: data.category, payment_method: data.paymentMethod, source: 'manual' }),
    client_id: data.nudgeId,
  }
  await enqueue(payload, uid)
  await flush()
  track('habit_nudge_logged', { via: 'action' })

  await Notifications.dismissNotificationAsync(data.nudgeId).catch(() => {})
  const amount = formatMoney(data.amountInr, await readCurrencyPreference())
  await Notifications.scheduleNotificationAsync({
    content: { title: `Logged ${amount}`, body: `${data.item} is in. Nice one.` },
    trigger: null,
  })
}

function isNudge(data: unknown): data is NudgeData {
  const d = data as Partial<NudgeData> | undefined
  return typeof d?.nudgeId === 'string' && typeof d.item === 'string' && typeof d.amountInr === 'number'
}

/** Taps and action buttons, from the response listener, a cold start, or the background task. */
export async function handleHabitResponse(response: NotificationsType.NotificationResponse): Promise<void> {
  const Notifications = getNotifications()
  const data = response.notification.request.content.data
  if (!Notifications || !isNudge(data)) return

  if (response.actionIdentifier === 'log') return quickLog(data, Notifications)

  const uid = currentUserId()
  if (response.actionIdentifier === 'skip') {
    if (uid) await claim(uid, data.nudgeId)
    track('habit_nudge_skipped')
    await Notifications.dismissNotificationAsync(data.nudgeId).catch(() => {})
    return
  }

  if (uid) await claim(uid, data.nudgeId)
  track('habit_nudge_opened')
  router.push({
    pathname: '/modals/log-expense',
    params: { item: data.item, amountInr: String(data.amountInr), category: data.category, paymentMethod: data.paymentMethod },
  })
}

/**
 * Android runs action buttons tapped while the app is backgrounded or killed
 * through this task, in a headless JS context. Call from the entry module,
 * at module scope, so the task exists before the OS asks for it.
 */
export function registerHabitNudgeTask(): void {
  const Notifications = getNotifications()
  if (!Notifications || Platform.OS !== 'android') return
  TaskManager.defineTask<NotificationsType.NotificationTaskPayload>(TASK, async ({ data }) => {
    if (data && 'actionIdentifier' in data) await handleHabitResponse(data)
  })
  Notifications.registerTaskAsync(TASK).catch((err) => console.warn('Habit nudge task registration failed', err))
}
