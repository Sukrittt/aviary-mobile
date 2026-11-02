import { ordinal, paydayHint, paydayInMonth, startingBalanceHref, upcomingPayday } from './upcomingPay'
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

describe('picking a payday by day of the month', () => {
  it('names the day', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st'])
  })

  it("lands on that day this month, or the month's last day when it's short", () => {
    expect(paydayInMonth(20, '2026-11-02')).toBe('2026-11-20')
    expect(paydayInMonth(31, '2026-11-02')).toBe('2026-11-30')
    expect(paydayInMonth(31, '2027-02-10')).toBe('2027-02-28')
    expect(paydayInMonth(5, '2026-11-02')).toBe('2026-11-05')
  })

  it('says the plan fills up now once the day has come, and when otherwise', () => {
    expect(paydayHint(1, '2026-11-02')).toBe("That's already landed, so your plan fills up now.")
    expect(paydayHint(2, '2026-11-02')).toBe("That's already landed, so your plan fills up now.")
    expect(paydayHint(20, '2026-11-02')).toBe('Your plan fills up Nov 20.')
    expect(paydayHint(31, '2026-11-02')).toBe('Your plan fills up Nov 30.')
  })
})
