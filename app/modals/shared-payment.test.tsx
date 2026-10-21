import { waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { readStatement } from '@/src/api/statement'
import { getRecentExpenses } from '@/src/api/expenses'
import { setPendingShare, takeSharedPhoto } from '@/src/lib/pendingShare'
import SharedPaymentScreen from './shared-payment'

jest.mock('@/src/api/expenses', () => ({ getRecentExpenses: jest.fn() }))
jest.mock('@/src/api/statement', () => ({ readStatement: jest.fn() }))
jest.mock('@/src/lib/downscaleImage', () => ({
  downscaleImage: jest.fn(async () => ({ uri: 'file:///small.jpg', base64: 'QUJD', mimeType: 'image/jpeg' })),
}))

const mockReplace = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn() }),
}))

const image = { image: { uri: '/data/shared/gpay.png', mimeType: 'image/png', width: 1080, height: 2400 } }
const statementItem = { id: 'a', item: 'Chai Point', amount: 85, date: '2026-10-21', category: 'Food', suggestSkip: null }

beforeEach(() => {
  jest.clearAllMocks()
  ;(getRecentExpenses as jest.Mock).mockResolvedValue({ rows: [], lastSpent: {} })
})

it('reads a success screenshot and opens the log sheet filled in', async () => {
  ;(readStatement as jest.Mock).mockResolvedValue({ id: 'p', items: [statementItem], credits: 0, dropped: 0 })
  setPendingShare(image)
  renderWithProviders(<SharedPaymentScreen />)
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  expect(readStatement).toHaveBeenCalledWith({ images: [{ data: 'QUJD', mimeType: 'image/jpeg' }] })
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/modals/log-expense',
    params: { shared: '1', item: 'Chai Point', amountInr: '85', date: '2026-10-21', category: 'Food' },
  })
})

it('flags a payment the server says is logged already', async () => {
  ;(readStatement as jest.Mock).mockResolvedValue({ id: 'p', items: [{ ...statementItem, suggestSkip: 'logged' }], credits: 0, dropped: 0 })
  setPendingShare(image)
  renderWithProviders(<SharedPaymentScreen />)
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  expect(mockReplace.mock.calls[0][0].params.dupe).toBe('1')
})

it('opens the sheet with the screenshot attached when it can’t be read', async () => {
  ;(readStatement as jest.Mock).mockRejectedValue(new Error('unreadable'))
  setPendingShare(image)
  renderWithProviders(<SharedPaymentScreen />)
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/modals/log-expense', params: { shared: '1' } }))
  expect(takeSharedPhoto()).toEqual({ uri: 'file:///small.jpg', base64: 'QUJD', mimeType: 'image/jpeg' })
})

it('reads a text receipt on the phone, keeping its UPI reference', async () => {
  setPendingShare({ text: '₹1,200 paid to Swiggy successfully via PhonePe. UPI Ref No. 312345678901' })
  renderWithProviders(<SharedPaymentScreen />)
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  expect(readStatement).not.toHaveBeenCalled()
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/modals/log-expense',
    params: { shared: '1', item: 'Swiggy', amountInr: '1200', notes: 'UPI ref 312345678901' },
  })
})

it('goes back when there is nothing waiting', () => {
  renderWithProviders(<SharedPaymentScreen />)
  expect(mockBack).toHaveBeenCalled()
  expect(mockReplace).not.toHaveBeenCalled()
})
