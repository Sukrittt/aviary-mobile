import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'aviary-upi-share-tip'

/**
 * Whether expense-added should say "Paid with UPI? Share the success screen
 * to Aviary." Once per device, on the first bank-paid log (where UPI lands),
 * Android only. A log that came in by sharing uses it up quietly: they know.
 */
export async function takeUpiShareTip({ android, paidWith, shared }: { android: boolean; paidWith: string; shared: boolean }): Promise<boolean> {
  if (!android || paidWith !== 'bank') return false
  try {
    if (await AsyncStorage.getItem(KEY)) return false
    await AsyncStorage.setItem(KEY, '1')
    return !shared
  } catch {
    return false
  }
}
