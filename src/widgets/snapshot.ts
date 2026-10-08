import { formatMoney, resolveCurrency } from '@/src/lib/currencies'
// The only I/O the widget system does. The headless widget task and the app's
// WidgetSync component both read/write this one key — kept separate from
// data.ts (pure) and WidgetSync.tsx (react-query) so the headless task can
// import just this, without pulling in react-query.
import * as SecureStore from 'expo-secure-store'
import type { WidgetData, WidgetRow } from './data'

const SNAPSHOT_KEY = 'mc-widget'

/** A row written by an older app version won't have `icon`/`overspent` —
 *  the headless task can run against yesterday's snapshot before the app
 *  ever reopens to overwrite it (e.g. right after an app update). */
function backfillRow(r: Partial<WidgetRow>, currencyCode: string): WidgetRow {
  return {
    icon: r.icon ?? '',
    name: r.name ?? '',
    pct: r.pct ?? 0,
    available: r.available ?? formatMoney(0, currencyCode),
    overspent: r.overspent ?? false,
  }
}

export function writeSnapshot(data: WidgetData): Promise<void> {
  return SecureStore.setItemAsync(SNAPSHOT_KEY, JSON.stringify(data)).catch(() => {})
}

export async function readSnapshot(): Promise<WidgetData | null> {
  try {
    const raw = await SecureStore.getItemAsync(SNAPSHOT_KEY)
    if (!raw) return null
    // Defaults backfill fields a snapshot written by an older app version
    // won't have — the headless task can run against yesterday's snapshot
    // before the app ever reopens to overwrite it (e.g. right after an
    // app update, when the OS pokes an existing widget instance).
    const parsed = JSON.parse(raw) as Partial<WidgetData>
    return {
      currencyCode: resolveCurrency(parsed.currencyCode),
      totalLeft: parsed.totalLeft ?? formatMoney(0, parsed.currencyCode),
      daysLeft: parsed.daysLeft ?? 0,
      updatedAt: parsed.updatedAt ?? 0,
      rows: (parsed.rows ?? []).map(r => backfillRow(r, resolveCurrency(parsed.currencyCode))),
      chips: parsed.chips ?? [],
      today: parsed.today ?? [],
      todayTotal: parsed.todayTotal ?? '',
      weeklyTrend: parsed.weeklyTrend ?? null,
      // Pace fields arrived with the bird-and-ring redesign. Without them the
      // ring draws empty and the bird stays content until the app reopens.
      leftPct: parsed.leftPct ?? null,
      monthPct: parsed.monthPct ?? 0,
      perDay: parsed.perDay ?? '',
      overspent: parsed.overspent ?? false,
    }
  } catch {
    return null
  }
}

/** Called on logout — otherwise the next account signed into on this device
 *  inherits whatever the previous one spent (same reasoning as PrivacyContext). */
export function clearSnapshot(): Promise<void> {
  return SecureStore.deleteItemAsync(SNAPSHOT_KEY).catch(() => {})
}
