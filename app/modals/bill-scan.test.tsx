import { StyleSheet } from 'react-native'
import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import BillScanModal from './bill-scan'
import type { BillScanDetail } from '@/src/api/bills'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: jest.fn(), push: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'b1' }),
}))

const mockUseBillScan = jest.fn()
jest.mock('@/src/hooks/useCategories', () => ({ ...jest.requireActual('@/src/hooks/useCategories'), useCategoryIcons: () => new Map() }))
jest.mock('@/src/hooks/useBillScans', () => ({
  useBillScan: (id: string) => mockUseBillScan(id),
}))

function detail(overrides: Partial<BillScanDetail>): BillScanDetail {
  return {
    id: 'b1',
    merchant: 'Blinkit',
    category: '🛒 Groceries',
    date: '2026-09-01',
    total: 900,
    my_share: 880,
    people_count: 2,
    items: [
      { name: 'Milk', price: 60, qty: 1, divisor: 1 },
      { name: 'Pizza', price: 800, qty: 1, divisor: 2 },
    ],
    expense_id: 'e1',
    image_status: 'ready',
    image_url: 'https://blob.example/signed',
    created_at: '2026-09-01T10:00:00+05:30',
    ...overrides,
  }
}

beforeEach(() => {
  mockBack.mockClear()
  mockUseBillScan.mockReset()
})

it('shows a loading phrase while the detail is still loading', () => {
  mockUseBillScan.mockReturnValue({ data: undefined, isLoading: true })
  const { getByText } = renderWithProviders(<BillScanModal />)
  expect(StyleSheet.flatten(getByText('Pulling up this scan…').props.style).textAlign).toBe('center')
})

it("shows a not-found message when the scan doesn't resolve", () => {
  mockUseBillScan.mockReturnValue({ data: undefined, isLoading: false })
  const { getByText } = renderWithProviders(<BillScanModal />)
  expect(getByText("Couldn't find that scan.")).toBeTruthy()
})

it('renders merchant, category, total, split, and each item with its share label', () => {
  mockUseBillScan.mockReturnValue({ data: detail({}), isLoading: false })
  const { getByText, getAllByText } = renderWithProviders(<BillScanModal />)

  expect(getAllByText('Blinkit').length).toBeGreaterThan(0)
  expect(getByText('Groceries · 1 Sep 2026')).toBeTruthy()
  expect(getByText('₹900')).toBeTruthy() // bill total
  expect(getByText('₹880')).toBeTruthy() // my share
  expect(getByText('2 people')).toBeTruthy()

  expect(getByText('Milk')).toBeTruthy()
  expect(getByText('Yours')).toBeTruthy()
  expect(getByText('Pizza')).toBeTruthy()
  expect(getByText('Split ÷2')).toBeTruthy()
})

it('labels an unassigned (skipped) item as not yours', () => {
  mockUseBillScan.mockReturnValue({
    data: detail({ items: [{ name: 'Delivery fee', price: 40, qty: 1, divisor: null }] }),
    isLoading: false,
  })
  const { getByText } = renderWithProviders(<BillScanModal />)
  expect(getByText('Not yours')).toBeTruthy()
})

it('shows a pending placeholder instead of the photo while the upload is still in flight', () => {
  mockUseBillScan.mockReturnValue({
    data: detail({ image_status: 'pending', image_url: null }),
    isLoading: false,
  })
  const { getByText } = renderWithProviders(<BillScanModal />)
  expect(getByText('Photo still uploading…')).toBeTruthy()
})


it('only displays the image after opening the preview chip, and closes it independently', () => {
  mockUseBillScan.mockReturnValue({ data: detail({}), isLoading: false })
  const { getByRole, queryByLabelText, getByLabelText } = renderWithProviders(<BillScanModal />)
  expect(queryByLabelText('Scanned bill image')).toBeNull()
  fireEvent.press(getByRole('button', { name: 'Preview bill' }))
  expect(getByLabelText('Scanned bill image')).toBeTruthy()
  fireEvent.press(getByRole('button', { name: 'Close bill preview' }))
  expect(queryByLabelText('Scanned bill image')).toBeNull()
  expect(mockBack).not.toHaveBeenCalled()
})

it('disables preview when the image is unavailable', () => {
  mockUseBillScan.mockReturnValue({ data: detail({ image_status: 'failed', image_url: null }), isLoading: false })
  const { getByRole, getByText, queryByLabelText } = renderWithProviders(<BillScanModal />)
  expect(getByText("Photo couldn't be saved")).toBeTruthy()
  const chip = getByRole('button', { name: 'Preview bill' })
  expect(chip.props.accessibilityState.disabled).toBe(true)
  fireEvent.press(chip)
  expect(queryByLabelText('Scanned bill image')).toBeNull()
})


it('shows a full-width receipt at its original proportions in the preview', () => {
  mockUseBillScan.mockReturnValue({ data: detail({}), isLoading: false })
  const { getByRole, getByLabelText } = renderWithProviders(<BillScanModal />)
  fireEvent.press(getByRole('button', { name: 'Preview bill' }))
  fireEvent(getByLabelText('Scanned bill image'), 'load', {
    nativeEvent: { source: { width: 720, height: 1600 } },
  })
  expect(StyleSheet.flatten(getByLabelText('Scanned bill image').props.style)).toMatchObject({
    width: '100%', aspectRatio: 720 / 1600,
  })
})

it('groups item shares by divisor, excludes skipped items, and splits fees by people count', () => {
  mockUseBillScan.mockReturnValue({ data: detail({
    total: 500, people_count: 4,
    items: [
      { name: 'Apples', price: 100, qty: 2, divisor: 4 },
      { name: 'Bread', price: 80, qty: 1, divisor: 4 },
      { name: 'Milk', price: 60, qty: 1, divisor: 2 },
      { name: 'Tea', price: 50, qty: 1, divisor: 1 },
      { name: 'Not mine', price: 190, qty: 1, divisor: null },
      { name: 'Delivery fee', price: 20, qty: 1, divisor: 1 },
    ],
  }), isLoading: false })
  const { getByText, queryByText } = renderWithProviders(<BillScanModal />)
  expect(getByText('By 4 share')).toBeTruthy()
  expect(getByText('₹45')).toBeTruthy()
  expect(getByText('By 2 share')).toBeTruthy()
  expect(getByText('₹30')).toBeTruthy()
  expect(getByText('By 1 share')).toBeTruthy()
  expect(queryByText('By 3 share')).toBeNull()
  expect(getByText('Fees & discounts share')).toBeTruthy()
  expect(getByText('₹5')).toBeTruthy()
})
