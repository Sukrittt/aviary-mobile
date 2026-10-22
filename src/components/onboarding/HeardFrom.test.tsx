import { act, fireEvent, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { track } from '@/src/lib/analytics'
import { HeardFrom, heardFromUnasked } from './HeardFrom'

const mockMutate = jest.fn((_patch: object) => {})
let mockUser: object | undefined
jest.mock('@/src/hooks/useUser', () => ({ useUser: () => ({ data: mockUser }), useUpdateUser: () => ({ mutate: mockMutate }) }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('@/src/api/accessMode', () => ({ accessMode: { subscribeLogout: () => () => {} } }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }))

// A new account whose extras are settled, so this is the one thing Home asks.
const NEW = { email: 'a@b.com', emailVerified: true, createdAt: '2026-11-01T00:00:00.000Z', onboardedAt: '2026-11-01T00:05:00.000Z', hiddenFeatures: [] }

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = NEW
})

it('waits for the extras card, and never asks twice', () => {
  expect(heardFromUnasked(NEW as never)).toBe(true)
  expect(heardFromUnasked({ ...NEW, hiddenFeatures: undefined } as never)).toBe(false)
  expect(heardFromUnasked({ ...NEW, heardFrom: 'reddit' } as never)).toBe(false)
  expect(heardFromUnasked({ ...NEW, createdAt: '2026-01-01T00:00:00.000Z' } as never)).toBe(false)
  expect(heardFromUnasked({ ...NEW, onboardedAt: null } as never)).toBe(false)
})

it('saves and tracks the picked answer in one tap, thanks you, then leaves', async () => {
  jest.useFakeTimers()
  const { findByText, getByText, queryByText } = renderWithProviders(<HeardFrom />)
  fireEvent.press(await findByText('Reddit'))
  expect(mockMutate).toHaveBeenCalledWith({ heardFrom: 'reddit' })
  expect(track).toHaveBeenCalledWith('onboarding_heard_from', { source: 'reddit' })
  expect(getByText('Thanks, that helps.')).toBeTruthy()
  act(() => jest.advanceTimersByTime(1100))
  expect(queryByText('Thanks, that helps.')).toBeNull()
  jest.useRealTimers()
})

it('Not now saves nothing and stays dismissed on this device', async () => {
  const { findByText, queryByText } = renderWithProviders(<HeardFrom />)
  fireEvent.press(await findByText('Not now'))
  await waitFor(() => expect(queryByText('Where did you hear about us?')).toBeNull())
  expect(mockMutate).not.toHaveBeenCalled()
  expect(track).not.toHaveBeenCalled()
  await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalledWith('mc-rollover-dismissed-heard-from', '1'))
})

it('stays hidden once dismissed here before', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('1')
  const { queryByText } = renderWithProviders(<HeardFrom />)
  await act(async () => {})
  expect(queryByText('Where did you hear about us?')).toBeNull()
})
