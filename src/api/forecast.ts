import { apiFetch } from './client'

/** Twin of Web/lib/forecast.ts's output, as GET /api/forecast returns it. */
export interface ForecastEnvelope {
  category: string
  available: number
  /** Recurring expenses and subscriptions still due this month. */
  scheduled: number
  usualDaily: number
  /** Left at month end. Negative means over. */
  projected: number
  /** First day the envelope goes below zero, if it does before month end. */
  runsOutOn: string | null
  /** Already below zero today. */
  overspent: boolean
}

export interface NextMonth {
  month: string
  income: number
  spokenFor: number
  free: number
}

export interface Forecast {
  /** Where usual spend came from, or null when there's too little to say. */
  basis: 'history' | 'thisMonth' | null
  daysLeft: number
  totalLeft: number | null
  envelopes: ForecastEnvelope[]
  nextMonth: NextMonth
}

export async function getForecast(): Promise<Forecast> {
  const resp = await apiFetch('/api/forecast')
  if (!resp.ok) throw new Error(`Failed to load forecast: ${resp.status}`)
  return resp.json()
}
