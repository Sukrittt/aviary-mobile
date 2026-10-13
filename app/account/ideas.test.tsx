import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { Alert } from '@/src/components/ui/AlertHost'
import { applyVote } from '@/src/lib/ideaVotes'
import IdeasScreen from './ideas'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
}))

const mockList = jest.fn()
const mockPost = jest.fn()
const mockVote = jest.fn()
jest.mock('@/src/api/ideas', () => ({
  listIdeas: (...args: unknown[]) => mockList(...args),
  postIdea: (...args: unknown[]) => mockPost(...args),
  voteIdea: (...args: unknown[]) => mockVote(...args),
}))

const idea = {
  id: 'i1',
  title: 'Split bills',
  description: 'With flatmates',
  authorFirstName: 'Asha',
  status: 'planned',
  up: 3,
  down: 1,
  score: 2,
  createdAt: '2026-10-01T00:00:00.000Z',
  myVote: 0,
  mine: false,
}

/** A fake server: votes change what the next list returns, like the real one. */
let server: (typeof idea)[]
beforeEach(() => {
  jest.clearAllMocks()
  server = [idea]
  mockList.mockImplementation(async () => server)
  mockVote.mockImplementation(async (id: string, value: -1 | 0 | 1) => {
    server = server.map((r) => (r.id === id ? { ...r, ...applyVote(r, r.myVote as -1 | 0 | 1, value), myVote: value } : r))
    return server[0]
  })
})

it('shows the idea with its status chip, first name and score', async () => {
  const { findByText, getByText, getByLabelText } = renderWithProviders(<IdeasScreen />)
  expect(await findByText('Split bills')).toBeTruthy()
  expect(getByText('Asha')).toBeTruthy()
  expect(getByLabelText('Score 2')).toBeTruthy()
  expect(mockList).toHaveBeenCalledWith('top', null)
})

it('upvotes, clears on a second tap, and switches to a downvote', async () => {
  const { findByText, getByLabelText } = renderWithProviders(<IdeasScreen />)
  await findByText('Split bills')
  fireEvent.press(getByLabelText('Upvote'))
  await waitFor(() => expect(mockVote).toHaveBeenLastCalledWith('i1', 1))
  await waitFor(() => expect(getByLabelText('Score 3')).toBeTruthy())
  fireEvent.press(getByLabelText('Upvote'))
  await waitFor(() => expect(mockVote).toHaveBeenLastCalledWith('i1', 0))
  await waitFor(() => expect(getByLabelText('Score 2')).toBeTruthy())
  fireEvent.press(getByLabelText('Upvote'))
  fireEvent.press(getByLabelText('Downvote'))
  await waitFor(() => expect(mockVote).toHaveBeenLastCalledWith('i1', -1))
  await waitFor(() => expect(server[0]).toMatchObject({ myVote: -1, score: 1 }))
  await waitFor(() => expect(getByLabelText('Score 1')).toBeTruthy())
})

it('sorts by new and filters by status', async () => {
  const { findByText, getByText } = renderWithProviders(<IdeasScreen />)
  await findByText('Split bills')
  fireEvent.press(getByText('New'))
  await waitFor(() => expect(mockList).toHaveBeenLastCalledWith('new', null))
  fireEvent.press(getByText('Shipped'))
  await waitFor(() => expect(mockList).toHaveBeenLastCalledWith('new', 'shipped'))
})

it('posts an idea from the sheet with the shared check animation', async () => {
  jest.useFakeTimers()
  mockPost.mockResolvedValue(undefined)
  const { findByText, getByText, getByPlaceholderText, queryByText } = renderWithProviders(<IdeasScreen />)
  await findByText('Split bills')
  fireEvent.press(getByText('Post an idea'))
  fireEvent.changeText(getByPlaceholderText('What would make Aviary better?'), 'Dark charts')
  await act(async () => fireEvent.press(getByText('Post idea')))
  expect(mockPost).toHaveBeenCalledWith('Dark charts', '')
  expect(queryByText('Post idea')).toBeNull()
  jest.useRealTimers()
})

it('shows written copy, not server text, when rate limited', async () => {
  mockPost.mockRejectedValue(new Error('rate_limited'))
  const alert = jest.spyOn(Alert, 'alert')
  const { findByText, getByText, getByPlaceholderText } = renderWithProviders(<IdeasScreen />)
  await findByText('Split bills')
  fireEvent.press(getByText('Post an idea'))
  fireEvent.changeText(getByPlaceholderText('What would make Aviary better?'), 'Dark charts')
  await act(async () => fireEvent.press(getByText('Post idea')))
  expect(alert).toHaveBeenCalledWith("Couldn't post that", "You've posted a few already. Try again later.")
})

it('opens the private bug report', async () => {
  const { getByText } = renderWithProviders(<IdeasScreen />)
  fireEvent.press(getByText('Report a bug'))
  expect(mockPush).toHaveBeenCalledWith('/account/feedback')
})
