import * as SecureStore from 'expo-secure-store'
import { budgetKeySuffix } from './activeBudget'
import { currentUserId } from '@/src/api/accessMode'
import { resolveCurrency } from './currencies'
const key = (id: string) => `mc-currency-${id}${budgetKeySuffix('-')}`
export async function readCurrencyPreference(): Promise<string> {
  const id = currentUserId()
  if (!id) return 'INR'
  try { return resolveCurrency(await SecureStore.getItemAsync(key(id))) } catch { return 'INR' }
}
export async function writeCurrencyPreference(code: unknown, userId = currentUserId()): Promise<void> {
  if (userId) await SecureStore.setItemAsync(key(userId), resolveCurrency(code)).catch(() => {})
}
// Many phones outside the US run an en-US locale, so the timezone is the better hint.
// ponytail: major markets only (main IANA zones + legacy aliases); unmapped zones fall back to the locale.
const ZONES_BY_CURRENCY: Record<string, string> = {
  INR: 'Asia/Kolkata Asia/Calcutta',
  MYR: 'Asia/Kuala_Lumpur Asia/Kuching',
  SGD: 'Asia/Singapore Singapore',
  IDR: 'Asia/Jakarta Asia/Makassar Asia/Jayapura Asia/Pontianak',
  PHP: 'Asia/Manila',
  THB: 'Asia/Bangkok',
  VND: 'Asia/Ho_Chi_Minh Asia/Saigon',
  BDT: 'Asia/Dhaka Asia/Dacca',
  PKR: 'Asia/Karachi',
  LKR: 'Asia/Colombo',
  NPR: 'Asia/Kathmandu Asia/Katmandu',
  CNY: 'Asia/Shanghai Asia/Urumqi PRC',
  HKD: 'Asia/Hong_Kong Hongkong',
  TWD: 'Asia/Taipei ROC',
  JPY: 'Asia/Tokyo Japan',
  KRW: 'Asia/Seoul ROK',
  AED: 'Asia/Dubai',
  SAR: 'Asia/Riyadh',
  QAR: 'Asia/Qatar',
  KWD: 'Asia/Kuwait',
  BHD: 'Asia/Bahrain',
  OMR: 'Asia/Muscat',
  ILS: 'Asia/Jerusalem Asia/Tel_Aviv Israel',
  TRY: 'Europe/Istanbul Asia/Istanbul Turkey',
  EGP: 'Africa/Cairo Egypt',
  NGN: 'Africa/Lagos',
  KES: 'Africa/Nairobi',
  ZAR: 'Africa/Johannesburg',
  GHS: 'Africa/Accra',
  MAD: 'Africa/Casablanca',
  GBP: 'Europe/London GB Europe/Belfast',
  EUR: 'Europe/Berlin Europe/Paris Europe/Madrid Europe/Rome Europe/Amsterdam Europe/Brussels Europe/Vienna Europe/Dublin Europe/Lisbon Europe/Athens Europe/Helsinki Europe/Luxembourg Europe/Bratislava Europe/Ljubljana Europe/Tallinn Europe/Riga Europe/Vilnius Europe/Zagreb Europe/Malta Asia/Nicosia Europe/Nicosia Europe/Sofia Atlantic/Canary Atlantic/Madeira Atlantic/Azores',
  CHF: 'Europe/Zurich',
  SEK: 'Europe/Stockholm',
  NOK: 'Europe/Oslo',
  DKK: 'Europe/Copenhagen',
  PLN: 'Europe/Warsaw Poland',
  CZK: 'Europe/Prague',
  HUF: 'Europe/Budapest',
  RON: 'Europe/Bucharest',
  UAH: 'Europe/Kyiv Europe/Kiev',
  RUB: 'Europe/Moscow',
  USD: 'America/New_York America/Chicago America/Denver America/Los_Angeles America/Phoenix America/Anchorage America/Detroit America/Boise America/Indiana/Indianapolis America/Kentucky/Louisville Pacific/Honolulu US/Eastern US/Central US/Mountain US/Pacific US/Alaska US/Hawaii US/Arizona',
  CAD: 'America/Toronto America/Vancouver America/Edmonton America/Winnipeg America/Halifax America/St_Johns America/Regina',
  MXN: 'America/Mexico_City America/Monterrey America/Tijuana America/Cancun America/Merida America/Chihuahua America/Hermosillo America/Mazatlan',
  BRL: 'America/Sao_Paulo America/Bahia America/Fortaleza America/Recife America/Manaus Brazil/East',
  ARS: 'America/Argentina/Buenos_Aires America/Buenos_Aires',
  CLP: 'America/Santiago',
  COP: 'America/Bogota',
  PEN: 'America/Lima',
  AUD: 'Australia/Sydney Australia/Melbourne Australia/Brisbane Australia/Perth Australia/Adelaide Australia/Hobart Australia/Darwin Australia/Canberra',
  NZD: 'Pacific/Auckland NZ',
}
export const TIMEZONE_CURRENCY: Record<string, string> = Object.fromEntries(
  Object.entries(ZONES_BY_CURRENCY).flatMap(([code, zones]) => zones.split(' ').map(zone => [zone, code])),
)
export function deviceCurrency(timeZone: string | undefined, localeCurrency: string | null | undefined) {
  return resolveCurrency((timeZone && TIMEZONE_CURRENCY[timeZone]) ?? localeCurrency)
}
