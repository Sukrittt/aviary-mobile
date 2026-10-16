import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { track } from '@/src/lib/analytics'
import { HeardFrom } from './HeardFrom'

const mockMutate = jest.fn(async (_patch: object) => ({}))
jest.mock('@/src/hooks/useUser', () => ({ useUpdateUser: () => ({ mutateAsync: mockMutate }) }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))

beforeEach(() => jest.clearAllMocks())

it('saves and tracks the picked answer', async () => {
  const onDone = jest.fn()
  const { getByText } = renderWithProviders(<HeardFrom onDone={onDone} />)
  fireEvent.press(getByText('Reddit'))
  fireEvent.press(getByText('Start budgeting'))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
  expect(mockMutate).toHaveBeenCalledWith({ heardFrom: 'reddit' })
  expect(track).toHaveBeenCalledWith('onboarding_heard_from', { source: 'reddit' })
})

it('skips without saving anything', () => {
  const onDone = jest.fn()
  const { getByText } = renderWithProviders(<HeardFrom onDone={onDone} />)
  fireEvent.press(getByText('Skip for now'))
  expect(onDone).toHaveBeenCalled()
  expect(mockMutate).not.toHaveBeenCalled()
})

it('moves on even when the save fails', async () => {
  mockMutate.mockRejectedValueOnce(new Error('503'))
  const onDone = jest.fn()
  const { getByText } = renderWithProviders(<HeardFrom onDone={onDone} />)
  fireEvent.press(getByText('A friend'))
  fireEvent.press(getByText('Start budgeting'))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
})
