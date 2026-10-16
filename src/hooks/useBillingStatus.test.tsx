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

// Async: the client resumes paused mutations before it refetches on focus.
async function returnToApp() {
  await act(async () => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
  })
}

it('refetches once per return to the app, however many screens read it', async () => {
  const screen = renderWithProviders(<><Status /><Status /><Status /></>)
  await waitFor(() => expect(screen.getAllByText('active')).toHaveLength(3))
  expect(getBillingStatus).toHaveBeenCalledTimes(1)

  // A return seconds after the fetch reuses it instead of asking again.
  await returnToApp()
  expect(getBillingStatus).toHaveBeenCalledTimes(1)

  const now = Date.now()
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 31_000)
  try {
    await returnToApp()
    await waitFor(() => expect(getBillingStatus).toHaveBeenCalledTimes(2))
  } finally {
    clock.mockRestore()
  }
})
