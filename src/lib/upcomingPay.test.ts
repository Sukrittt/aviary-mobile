import { startingBalanceHref, upcomingMonthlyPay } from './upcomingPay'
import type { RecurringIncomeRow } from '@/src/types'

const sched = (start_date: string, over: Partial<RecurringIncomeRow> = {}): RecurringIncomeRow => ({
  id: start_date, label: 'Salary', amount: '50000', frequency: 'monthly', start_date, end_date: '',
  next_run_date: start_date, account_id: '', status: 'active', created_at: '', ...over,
})

describe('upcomingMonthlyPay', () => {
  it('finds a monthly pay whose first payday is in a later month', () => {
    expect(upcomingMonthlyPay([sched('2026-11-04')], '2026-10')?.start_date).toBe('2026-11-04')
  })

  it('ignores a pay that already counts this month', () => {
    expect(upcomingMonthlyPay([sched('2026-10-25')], '2026-10')).toBeUndefined()
    expect(upcomingMonthlyPay([sched('2026-09-01')], '2026-10')).toBeUndefined()
  })

  it('ignores paused, deleted-and-ended, and non-monthly schedules', () => {
    expect(upcomingMonthlyPay([
      sched('2026-11-04', { status: 'paused' }),
      sched('2026-11-05', { status: 'ended' }),
      sched('2026-11-06', { frequency: 'weekly' }),
    ], '2026-10')).toBeUndefined()
  })

  it('picks the earliest when there are several', () => {
    expect(upcomingMonthlyPay([sched('2026-12-01'), sched('2026-11-04')], '2026-10')?.start_date).toBe('2026-11-04')
  })
})

describe('startingBalanceHref', () => {
  it('opens Add income labelled as a starting balance, naming the payday', () => {
    expect(startingBalanceHref('2026-11-04')).toEqual({
      pathname: '/modals/add-income',
      params: { label: 'Starting balance', intro: 'Your pay lands Nov 4. What do you have to spend till then?' },
    })
  })
})
