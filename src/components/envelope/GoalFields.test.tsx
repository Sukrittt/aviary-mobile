import { fireEvent } from '@testing-library/react-native'
import * as reanimated from 'react-native-reanimated'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { GoalLine, shortGoalLine } from './GoalFields'
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

describe('GoalLine', () => {
  const behind = goalProgress({ goal: { amount: 4000, by: '2027-10' } as never, month: '2026-10', available: 0, assigned: 0, spent: 0 })!

  it("sweeps a behind goal's Set pill once, then rests on plain Set", () => {
    const onPull = jest.fn()
    const { getByText } = renderWithProviders(
      <GoalLine category="Trip" goal={{ amount: 4000, by: '2027-10' } as never} progress={behind} month="2026-10" money={money} onPull={onPull} />,
    )
    fireEvent.press(getByText('Set'))
    expect(onPull).toHaveBeenCalledWith('Trip', behind.behindBy)
  })

  it('shows Set as plain text under reduced motion', () => {
    const spy = jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true)
    const { getByText } = renderWithProviders(
      <GoalLine category="Trip" goal={{ amount: 4000, by: '2027-10' } as never} progress={behind} month="2026-10" money={money} onPull={jest.fn()} />,
    )
    expect(getByText('Set')).toBeTruthy()
    spy.mockRestore()
  })
})
