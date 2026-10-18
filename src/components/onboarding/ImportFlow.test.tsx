import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { ImportFailure, type ImportReview } from '@/src/api/imports'
import { ImportFlow } from './ImportFlow'

const mockPreview = jest.fn()
const mockRecompute = jest.fn()
const mockCommit = jest.fn()
const mockPick = jest.fn()
jest.mock('@/src/api/imports', () => ({
  ...jest.requireActual('@/src/api/imports'),
  previewImport: (...a: unknown[]) => mockPreview(...a),
  recomputeImport: (...a: unknown[]) => mockRecompute(...a),
  commitImport: (...a: unknown[]) => mockCommit(...a),
}))
jest.mock('@/src/lib/filePicker', () => ({ canPickFiles: true, pickFile: () => mockPick() }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('@/src/hooks/useUser', () => ({ useUpdateUser: () => ({ mutate: jest.fn() }) }))

const review: ImportReview = {
  importId: 'imp1',
  app: 'monefy',
  filename: 'monefy.csv',
  direction: 'negative_spend',
  directionSource: 'sign',
  currency: 'EUR',
  hasCurrency: true,
  counts: { expense: 7, income: 2, from: '2026-09-01', to: '2026-10-05' },
  skipped: { transfer: 2, opening_balance: 1, other_currency: 1 },
  otherCurrencies: ['USD'],
  droppedOverCap: 0,
  samples: [
    { date: '2026-10-05', item: 'Split dinner part 2', amount: 20, kind: 'expense' },
    { date: '2026-10-01', item: 'Payroll', amount: 3000, kind: 'income' },
  ],
  groups: ['Essentials', 'Lifestyle', 'Savings'],
  categories: [
    { source: 'Bills', name: 'Bills', group: 'Essentials', monthly: 80 },
    { source: 'Gifts', name: 'Gifts', group: 'Lifestyle', monthly: 60 },
  ],
  accounts: [{ source: 'Bank', name: 'Bank', type: 'bank' }],
  droppedAccounts: [],
  salary: { label: 'Payroll', amount: 3000, day: 1 },
  budgetTotal: 140,
}

const file = (size = 10) => ({ uri: 'file:///monefy.csv', name: 'monefy.csv', mimeType: 'text/csv', size })

function render() {
  const onDone = jest.fn()
  const onFresh = jest.fn()
  const utils = renderWithProviders(<ImportFlow onFresh={onFresh} onDone={onDone} />)
  return { ...utils, onDone, onFresh }
}

function toReview(app = 'Monefy') {
  const utils = render()
  fireEvent.press(utils.getByText('Bring it all over'))
  fireEvent.press(utils.getByLabelText(app))
  fireEvent.press(utils.getByLabelText('Choose your export file'))
  return utils
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPick.mockResolvedValue(file())
  mockPreview.mockResolvedValue(review)
  mockRecompute.mockResolvedValue({ ...review, direction: 'positive_spend' })
  mockCommit.mockResolvedValue({ importId: 'imp1', total: 9, groupCount: 2, categoryCount: 2, income: 3000 })
})

it('starting fresh hands straight back to the usual setup', () => {
  const { getByText, onFresh } = render()
  expect(getByText('Switching apps?')).toBeTruthy()
  fireEvent.press(getByText('No, start fresh'))
  expect(onFresh).toHaveBeenCalled()
})

it('shows how to export from the picked app, then what it read', async () => {
  const { getByText, findByText } = toReview()
  expect(getByText('Open Settings, then Export to file.')).toBeTruthy()
  expect(await findByText('Here’s what we found')).toBeTruthy()
  expect(mockPreview).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///monefy.csv' }))
  expect(getByText('7 spends · 2 paydays · Sep 2026 to Oct 2026')).toBeTruthy()
  expect(getByText('We left out 2 transfers between your accounts and 1 opening balance. They aren’t spending.')).toBeTruthy()
  expect(getByText('We’re reading negative amounts as spends.')).toBeTruthy()
  expect(getByText('We think your salary is €3,000 on about the 1st.')).toBeTruthy()
})

it('a cancelled picker stays put without uploading', async () => {
  mockPick.mockResolvedValue(null)
  const { getByText } = toReview()
  await waitFor(() => expect(mockPick).toHaveBeenCalled())
  expect(getByText('Pick your export')).toBeTruthy()
  expect(mockPreview).not.toHaveBeenCalled()
})

it("a flip asks the server to recompute, so what's approved is what's written", async () => {
  const { findByText } = toReview()
  fireEvent.press(await findByText('That’s backwards'))
  await waitFor(() => expect(mockRecompute).toHaveBeenCalledWith('imp1', { direction: 'positive_spend' }))
  expect(await findByText('We’re reading positive amounts as spends.')).toBeTruthy()
})

it('commits the edits with the check animation, then hands over', async () => {
  jest.useFakeTimers()
  const { findByLabelText, getByLabelText, getByText, onDone } = toReview()
  fireEvent.changeText(await findByLabelText('Name for Bills'), 'Utilities')
  fireEvent.press(getByLabelText('Group for Gifts, Lifestyle'))
  fireEvent.press(getByText('Savings'))
  fireEvent.press(getByText('Looks right, set me up'))
  await waitFor(() => expect(mockCommit).toHaveBeenCalled())
  expect(mockCommit.mock.calls[0]).toEqual(['imp1', {
    currency: 'EUR',
    direction: 'negative_spend',
    groups: ['Essentials', 'Lifestyle', 'Savings'],
    categories: [{ source: 'Bills', name: 'Utilities', group: 'Essentials' }, { source: 'Gifts', name: 'Gifts', group: 'Savings' }],
    accounts: [{ source: 'Bank', name: 'Bank', type: 'bank' }],
    salary: { amount: 3000, day: 1 },
  }])
  expect(await findByLabelText('You’re set up')).toBeTruthy()
  expect(onDone).not.toHaveBeenCalled()
  act(() => jest.advanceTimersByTime(1100))
  expect(onDone).toHaveBeenCalledWith({ result: expect.objectContaining({ total: 9 }), currency: 'EUR' })
  jest.useRealTimers()
})

it('a new group added from an envelope files the envelope under it', async () => {
  const { findByLabelText, getByLabelText, getByText } = toReview()
  fireEvent.press(await findByLabelText('Group for Bills, Essentials'))
  fireEvent.changeText(getByLabelText('New group name'), 'Home')
  fireEvent.press(getByLabelText('Add group'))
  fireEvent.press(getByText('Looks right, set me up'))
  await waitFor(() => expect(mockCommit).toHaveBeenCalled())
  expect(mockCommit.mock.calls[0][1]).toMatchObject({
    groups: ['Essentials', 'Lifestyle', 'Savings', 'Home'],
    categories: [{ source: 'Bills', group: 'Home' }, { source: 'Gifts', group: 'Lifestyle' }],
  })
})

it('a flip that finds a salary fills it in', async () => {
  mockPreview.mockResolvedValue({ ...review, salary: null })
  mockRecompute.mockResolvedValue({ ...review, direction: 'positive_spend', salary: { label: 'Payroll', amount: 3100, day: 2 } })
  const { findByLabelText, getByLabelText, getByText } = toReview()
  expect((await findByLabelText('Monthly income')).props.value).toBe('')
  fireEvent.press(getByText('That’s backwards'))
  await waitFor(() => expect(getByLabelText('Monthly income').props.value).toBe('3100'))
  expect(getByLabelText('Payday, day of the month').props.value).toBe('2')
})

it('stops at more bank accounts than the app holds, rather than dropping one quietly', async () => {
  const accounts: ImportReview['accounts'] = [...Array.from({ length: 5 }, (_, i) => ({ source: `B${i}`, name: `B${i}`, type: 'bank' as const })), { source: 'Cash', name: 'Cash', type: 'cash' }]
  mockPreview.mockResolvedValue({ ...review, accounts })
  const { findByLabelText, getByText } = toReview()
  fireEvent.press(await findByLabelText('Cash, Bank'))
  expect(getByText('You can have up to 5 bank accounts. Make one of these cash or a credit card.')).toBeTruthy()
  fireEvent.press(getByText('Looks right, set me up'))
  expect(mockCommit).not.toHaveBeenCalled()
})

it('a cleared salary commits without one', async () => {
  const { findByLabelText, getByText } = toReview()
  fireEvent.changeText(await findByLabelText('Monthly income'), '')
  fireEvent.press(getByText('Looks right, set me up'))
  await waitFor(() => expect(mockCommit.mock.calls[0][1]).toMatchObject({ salary: null }))
})

it('turns failure codes into its own copy, never the server’s', async () => {
  mockPreview.mockRejectedValue(new ImportFailure('no_columns'))
  const { findByText } = toReview()
  expect(await findByText('We couldn’t find a date and an amount column. Check the file is the transactions export, not a report.')).toBeTruthy()
})

it('stops a file over 4 MB before uploading it', async () => {
  mockPick.mockResolvedValue(file(4 * 1024 * 1024 + 1))
  const { findByText } = toReview('YNAB')
  expect(await findByText('That file’s too big. Export a shorter date range and try again.')).toBeTruthy()
  expect(mockPreview).not.toHaveBeenCalled()
})

it('an edit survives a flip that drops its envelope and the flip back that returns it', async () => {
  const without = { ...review, direction: 'positive_spend' as const, categories: [{ source: 'Salary', name: 'Salary', group: 'Lifestyle', monthly: 3000 }] }
  mockRecompute.mockResolvedValueOnce(without).mockResolvedValueOnce(review)
  const { findByLabelText, getByLabelText, getByText, findByText } = toReview()
  fireEvent.press(await findByLabelText('Group for Gifts, Lifestyle'))
  fireEvent.press(getByText('Savings'))
  fireEvent.press(getByText('That’s backwards'))
  await findByText('We’re reading positive amounts as spends.')
  fireEvent.press(getByText('That’s backwards'))
  await findByText('We’re reading negative amounts as spends.')
  expect(getByLabelText('Group for Gifts, Savings')).toBeTruthy()
})
