import { fireEvent } from '@testing-library/react-native'
import * as RN from 'react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { ExpenseConflictReview } from './ExpenseConflictReview'
import type { ExpenseRow } from '@/src/types'

const original = { item: 'Lunch', amount: '100', date: '2026-09-18', category: 'Food', paymentMethod: 'bank' as const, notes: '' }
const latest = { id: 'id1', version: 1, item: 'Lunch', amount_inr: '150', date: '2026-09-18', category: 'Food', payment_method: 'bank', notes: '' } as ExpenseRow

afterEach(() => jest.restoreAllMocks())

it.each([
  [390, 1, false],
  [320, 1, true],
  [390, 1.6, true],
])('adapts comparison at width %i and font scale %f', (width, fontScale, stacked) => {
  RN.Dimensions.set({ window: { width, height: 568, scale: 2, fontScale }, screen: { width, height: 568, scale: 2, fontScale } })
  const onChoose = jest.fn()
  const onClose = jest.fn()
  const screen = renderWithProviders(<ExpenseConflictReview latest={latest} original={original}
    draft={{ ...original, item: 'Dinner' }} onChoose={onChoose} onClose={onClose} />)
  expect(screen.getByTestId('expense-conflict-scroll')).toBeTruthy()
  const style = RN.StyleSheet.flatten(screen.getByTestId('conflict-values-Description').props.style)
  expect(style.flexDirection).toBe(stacked ? undefined : 'row')
  expect(screen.getByLabelText('Description, with your changes: Dinner')).toBeTruthy()
  // The preview keeps the server's newer amount; it does not show stale ₹100.
  expect(screen.getByLabelText('Amount, with your changes: ₹150')).toBeTruthy()
  expect(screen.queryByText('Date')).toBeNull()
  expect(screen.queryByText('Category')).toBeNull()
  expect(onChoose).not.toHaveBeenCalled()
  fireEvent.press(screen.getByRole('button', { name: 'Continue with my changes' }))
  expect(onChoose).toHaveBeenCalledWith(true)
  fireEvent.press(screen.getByText('Use latest instead'))
  expect(onChoose).toHaveBeenLastCalledWith(false)
  fireEvent.press(screen.getByLabelText('Back to editing'))
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('shows payment method and notes edits in the comparison', () => {
  const screen = renderWithProviders(<ExpenseConflictReview latest={latest} original={original}
    draft={{ ...original, paymentMethod: 'credit_card', notes: 'work trip' }} onChoose={jest.fn()} onClose={jest.fn()} />)
  expect(screen.getByLabelText('Payment method, with your changes: Credit Card')).toBeTruthy()
  expect(screen.getByLabelText('Notes, with your changes: work trip')).toBeTruthy()
})
