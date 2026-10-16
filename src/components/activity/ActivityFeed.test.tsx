import { ActivityIndicator, Image, RefreshControl, Text } from 'react-native'
import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { ExpenseRow } from '@/src/types'
// @ts-expect-error The preset's shared native-method mocks ship without types.
import MockNativeMethods from '@react-native/jest-preset/jest/MockNativeMethods'
import { ActivityFeed } from './ActivityFeed'

const mockFeed = jest.fn()
jest.mock('@/src/hooks/useExpenses', () => ({
  useExpensesFeed: () => mockFeed(),
}))

const txn = (over: Partial<ExpenseRow>): ExpenseRow => ({
  id: 'e1', timestamp: '2026-10-12T10:00:00', date: '2026-10-12', item: 'Plant', amount_inr: '300', category: 'Home',
  notes: '', source: '', amount: '300', description: '', payment_method: 'upi', ...over,
})

const mockEdit = jest.fn()
const mockDeleteAsk = jest.fn()

function Harness({ onOpenActions }: { onOpenActions: jest.Mock }) {
  return (
    <ActivityFeed params={{}} header={<Text>header</Text>} empty={<Text>nothing here</Text>} categoryByName={new Map()}
      accountNameOf={(id) => (id === 'acc1' ? 'HDFC Savings' : '')} onOpenActions={onOpenActions} onEdit={mockEdit} onDelete={mockDeleteAsk}
      isDeleting={() => false} onDeleteDone={() => {}} refreshControl={<RefreshControl refreshing={false} />} />
  )
}

function renderFeed(rows: ExpenseRow[], onOpenActions = jest.fn()) {
  mockFeed.mockReturnValue({ data: { pages: [{ rows }] }, isLoading: false, isError: false, hasNextPage: false })
  return renderWithProviders(<Harness onOpenActions={onOpenActions} />)
}

beforeEach(() => {
  jest.clearAllMocks()
  // Where a tapped card sits on screen; the detail page grows out of it.
  ;(MockNativeMethods.measureInWindow as jest.Mock).mockImplementation((cb: (x: number, y: number, w: number, h: number) => void) => cb(16, 200, 380, 460))
})

it('shows a photo card for a signed photo and a category card otherwise, with no add-photo button', () => {
  const screen = renderFeed([txn({ id: 'a', item: 'Plant', has_photo: true, photo_url: 'https://blob.test/a.jpg?s=1' }), txn({ id: 'b', item: 'Tea' })])
  expect(screen.UNSAFE_queryAllByType(Image).map((i) => i.props.source.uri)).toEqual(['https://blob.test/a.jpg?s=1'])
  expect(screen.queryByText('Add a photo')).toBeNull()
  expect(screen.getByText("You're all caught up.")).toBeTruthy()
})

it('shows the empty state when nothing matches', () => {
  const screen = renderFeed([])
  expect(screen.getByText('nothing here')).toBeTruthy()
})

describe('detail page', () => {
  it('opens from the card with everything about the expense', () => {
    const screen = renderFeed([txn({ account_id: 'acc1', notes: 'For the balcony', has_photo: true, photo_url: 'https://blob.test/a.jpg?s=1' })])
    fireEvent.press(screen.getByLabelText('Plant, Home. View details'))
    expect(screen.getByText('Monday, 12 October 2026')).toBeTruthy()
    expect(screen.getByText('HDFC Savings')).toBeTruthy()
    expect(screen.getAllByText('For the balcony').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('View photo of Plant')).toBeTruthy()
  })

  it('says when an expense has no account', () => {
    const screen = renderFeed([txn({})])
    fireEvent.press(screen.getByLabelText('Plant, Home. View details'))
    expect(screen.getByText('Not set')).toBeTruthy()
  })

  it('edits straight away from the page', () => {
    const screen = renderFeed([txn({})])
    fireEvent.press(screen.getByLabelText('Plant, Home. View details'))
    fireEvent.press(screen.getByText('Edit'))
    expect(mockEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
    expect(screen.queryByLabelText('Close')).toBeNull()
  })

  it('closes back into the card before asking to delete', () => {
    jest.useFakeTimers()
    try {
      const screen = renderFeed([txn({})])
      fireEvent.press(screen.getByLabelText('Plant, Home. View details'))
      fireEvent.press(screen.getByLabelText('Delete'))
      expect(mockDeleteAsk).not.toHaveBeenCalled()
      act(() => jest.runAllTimers())
      expect(mockDeleteAsk).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
      expect(screen.queryByLabelText('Close')).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it('keeps long-press for the quick Edit and Delete sheet', () => {
    const onOpenActions = jest.fn()
    const screen = renderFeed([txn({})], onOpenActions)
    fireEvent(screen.getByLabelText('Plant, Home. View details'), 'longPress')
    expect(onOpenActions).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
  })
})

it('shows feed-shaped skeleton cards, not a spinner, while the first page loads', () => {
  mockFeed.mockReturnValue({ data: undefined, isLoading: true, isError: false, hasNextPage: false })
  const screen = renderWithProviders(<Harness onOpenActions={jest.fn()} />)
  expect(screen.getByLabelText('Loading your feed')).toBeTruthy()
  expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0)
})
