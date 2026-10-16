import { useEffect, useState } from 'react'
import { Alert, Image, RefreshControl, Text } from 'react-native'
import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { ExpenseRow } from '@/src/types'
// @ts-expect-error The preset's shared native-method mocks ship without types.
import MockNativeMethods from '@react-native/jest-preset/jest/MockNativeMethods'
import { ActivityFeed } from './ActivityFeed'

const mockFeed = jest.fn()
const mockSave = jest.fn()
jest.mock('@/src/hooks/useExpenses', () => ({
  useExpensesFeed: () => mockFeed(),
  useSaveExpensePhoto: () => ({ mutateAsync: mockSave, isPending: false }),
}))
const mockPick = jest.fn()
jest.mock('@/src/features/log-expense/ExpensePhotoField', () => ({ pickPhoto: (s: string) => mockPick(s) }))
const mockTrack = jest.fn()
jest.mock('@/src/lib/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }))

const txn = (over: Partial<ExpenseRow>): ExpenseRow => ({
  id: 'e1', timestamp: '2026-10-12T10:00:00', date: '2026-10-12', item: 'Plant', amount_inr: '300', category: 'Home',
  notes: '', source: '', amount: '300', description: '', payment_method: 'upi', ...over,
})

let bump: () => void = () => {}

const mockEdit = jest.fn()
const mockDeleteAsk = jest.fn()

function Harness({ onOpenActions }: { onOpenActions: jest.Mock }) {
  const [, setN] = useState(0)
  useEffect(() => {
    bump = () => setN((n) => n + 1)
  }, [])
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

it('shows a photo card for a signed photo and a category card with Add a photo otherwise', () => {
  const screen = renderFeed([txn({ id: 'a', item: 'Plant', has_photo: true, photo_url: 'https://blob.test/a.jpg?s=1' }), txn({ id: 'b', item: 'Tea' })])
  expect(screen.UNSAFE_queryAllByType(Image).map((i) => i.props.source.uri)).toEqual(['https://blob.test/a.jpg?s=1'])
  expect(screen.queryByLabelText('Add a photo to Plant')).toBeNull()
  expect(screen.getByLabelText('Add a photo to Tea')).toBeTruthy()
  expect(screen.getByText("You're all caught up.")).toBeTruthy()
})

it("doesn't offer a second photo when the row has one the server didn't sign", () => {
  const screen = renderFeed([txn({ has_photo: true })])
  expect(screen.queryByLabelText('Add a photo to Plant')).toBeNull()
})

it('shows the empty state when nothing matches', () => {
  const screen = renderFeed([])
  expect(screen.getByText('nothing here')).toBeTruthy()
})

it('adds a photo from the card, shows it straight away and tracks it', async () => {
  mockPick.mockResolvedValue({ uri: 'file:///picked.jpg', base64: 'abc', mimeType: 'image/jpeg' })
  mockSave.mockResolvedValue(undefined)
  const screen = renderFeed([txn({})])
  fireEvent.press(screen.getByLabelText('Add a photo to Plant'))
  await act(async () => fireEvent.press(screen.getByLabelText('Choose photo')))
  expect(mockPick).toHaveBeenCalledWith('library')
  expect(mockSave).toHaveBeenCalledWith({ id: 'e1', photo: { base64: 'abc', mimeType: 'image/jpeg' } })
  await waitFor(() => expect(mockTrack).toHaveBeenCalledWith('expense_photo_added', { from: 'feed' }))
  expect(screen.UNSAFE_queryAllByType(Image).map((i) => i.props.source.uri)).toEqual(['file:///picked.jpg'])
})

it('takes the photo back off and says so when the upload fails', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  mockPick.mockResolvedValue({ uri: 'file:///picked.jpg', base64: 'abc', mimeType: 'image/jpeg' })
  mockSave.mockRejectedValue(new Error('503'))
  const screen = renderFeed([txn({})])
  fireEvent.press(screen.getByLabelText('Add a photo to Plant'))
  await act(async () => fireEvent.press(screen.getByLabelText('Take photo')))
  await waitFor(() => expect(alert).toHaveBeenCalledWith("Photo didn't upload", 'Check your connection and try again.'))
  expect(screen.getByLabelText('Add a photo to Plant')).toBeTruthy()
  expect(mockTrack).not.toHaveBeenCalled()
})

it('drops the just-picked photo once the server photo changes, so a later removal shows Add a photo again', async () => {
  mockPick.mockResolvedValue({ uri: 'file:///picked.jpg', base64: 'abc', mimeType: 'image/jpeg' })
  mockSave.mockResolvedValue(undefined)
  const screen = renderFeed([txn({})])
  fireEvent.press(screen.getByLabelText('Add a photo to Plant'))
  await act(async () => fireEvent.press(screen.getByLabelText('Choose photo')))
  await waitFor(() => expect(mockTrack).toHaveBeenCalled())

  const rerender = (row: ExpenseRow) => {
    mockFeed.mockReturnValue({ data: { pages: [{ rows: [row] }] }, isLoading: false, isError: false, hasNextPage: false })
    // Any card action re-renders the feed; pulling a fresh read is enough here.
    act(() => bump())
  }
  rerender(txn({ has_photo: true, photo_url: 'https://blob.test/e1-new.jpg?s=1' }))
  expect(screen.UNSAFE_queryAllByType(Image).map((i) => i.props.source.uri)).toEqual(['https://blob.test/e1-new.jpg?s=1'])

  rerender(txn({}))
  expect(screen.getByLabelText('Add a photo to Plant')).toBeTruthy()
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
