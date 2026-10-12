import { Text } from 'react-native'
import { act, waitFor } from '@testing-library/react-native'
import { focusManager } from '@tanstack/react-query'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { getBillingStatus } from '@/src/api/billing'
import { useBillingStatus } from './useBillingStatus'

jest.mock('@/src/api/billing', () => ({
  ...jest.requireActual('@/src/api/billing'),
  getBillingStatus: jest.fn(() => Promise.resolve({ mode: 'active', allowed: true })),
}))
jest.mock('@/src/api/accessMode', () => ({
  ...jest.requireActual('@/src/api/accessMode'),
  currentUserId: () => 'user_1',
}))

function Status() {
  const { data } = useBillingStatus()
  return <Text>{data?.mode ?? 'loading'}</Text>
}

afterEach(() => focusManager.setFocused(undefined))

it('refetches once per return to the app, however many screens read it', async () => {
  const screen = renderWithProviders(<><Status /><Status /><Status /></>)
  await waitFor(() => expect(screen.getAllByText('active')).toHaveLength(3))
  expect(getBillingStatus).toHaveBeenCalledTimes(1)

  act(() => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
  })

  await waitFor(() => expect(getBillingStatus).toHaveBeenCalledTimes(2))
})
