import { startingBalanceHref, upcomingPayday } from './upcomingPay'
import type { RecurringIncomeRow } from '@/src/types'

const sched = (start_date: string, over: Partial<RecurringIncomeRow> = {}): RecurringIncomeRow => ({
  id: start_date, label: 'Salary', amount: '50000', frequency: 'monthly', start_date, end_date: '',
  next_run_date: start_date, account_id: '', status: 'active', created_at: '', ...over,
})

describe('upcomingPayday', () => {
  it('picks the soonest payday of the running schedules', () => {
    expect(upcomingPayday([sched('2026-11-25'), sched('2026-11-05', { status: 'paused' }), sched('2026-11-20')])?.next_run_date).toBe('2026-11-20')
  })

  it('has nothing to say without a schedule', () => {
    expect(upcomingPayday([])).toBeUndefined()
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
