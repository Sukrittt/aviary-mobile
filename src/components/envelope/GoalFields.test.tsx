import { shortGoalLine } from './GoalFields'
import { goalProgress } from '@/src/lib/goal'

const money = (n: number) => `₹${n}`
const line = (goal: object, available: number, assigned: number) =>
  shortGoalLine(goalProgress({ goal: goal as never, month: '2026-10', available, assigned, spent: 0 })!, money)

describe('shortGoalLine', () => {
  it('drops "to make it by" so each status fits one line', () => {
    expect(line({ amount: 4000, by: '2027-10' }, 0, 0)).toBe('Behind · ₹308/mo by Oct 2027')
    expect(line({ amount: 4000, by: '2027-10' }, 308, 308)).toBe('On track · ₹308/mo from Nov')
    expect(line({ amount: 1000, by: '2026-11' }, 800, 800)).toBe('On track · ₹200 more in Nov')
    expect(line({ amount: 1000 }, 0, 0)).toBe('Assign monthly to see when')
  })
})
