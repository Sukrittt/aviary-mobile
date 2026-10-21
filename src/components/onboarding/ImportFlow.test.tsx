import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { ImportFailure, type ImportReview } from '@/src/api/imports'
import { Linking } from 'react-native'
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
  const utils = renderWithProviders(<ImportFlow onFresh={onFresh} onDone={onDone} onAlreadySetUp={jest.fn()} />)
  return { ...utils, onDone, onFresh }
}

function toReview(app = 'Monefy') {
  const utils = render()
  fireEvent.press(utils.getByText('I’m switching apps'))
  fireEvent.press(utils.getByText('Continue'))
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

it('skips the start question when it was already answered, and Back starts fresh', () => {
  const onFresh = jest.fn()
  const utils = renderWithProviders(<ImportFlow skipAsk onFresh={onFresh} onDone={jest.fn()} onAlreadySetUp={jest.fn()} />)
  expect(utils.queryByText('How do you want to start?')).toBeNull()
  expect(utils.getByText('Where are you coming from?')).toBeTruthy()
  expect(utils.getByLabelText('Step 1 of 3')).toBeTruthy()
  fireEvent.press(utils.getByLabelText('Go back'))
  expect(onFresh).toHaveBeenCalled()
})

it('starting fresh hands straight back to the usual setup', () => {
  const { getByText, onFresh } = render()
  expect(getByText('How do you want to start?')).toBeTruthy()
  fireEvent.press(getByText('I’m starting fresh'))
  fireEvent.press(getByText('Continue'))
  expect(onFresh).toHaveBeenCalled()
})

it('starts on starting fresh, and the choice can change before Continue', () => {
  const { getByText, getByLabelText, onFresh } = render()
  expect(getByLabelText(/^I’m starting fresh/).props.accessibilityState).toMatchObject({ checked: true })
  expect(getByLabelText(/^I’m switching apps/).props.accessibilityState).toMatchObject({ checked: false })
  fireEvent.press(getByText('I’m switching apps'))
  expect(getByLabelText(/^I’m starting fresh/).props.accessibilityState).toMatchObject({ checked: false })
  fireEvent.press(getByText('I’m starting fresh'))
  fireEvent.press(getByText('Continue'))
  expect(onFresh).toHaveBeenCalled()
})

it('walks through the export in steps, with the catch and the app’s own guide', () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  const utils = render()
  fireEvent.press(utils.getByText('I’m switching apps'))
  fireEvent.press(utils.getByText('Continue'))
  fireEvent.press(utils.getByLabelText('Wallet, BudgetBakers'))
  expect(utils.getByText('In Wallet on Android, open the ≡ menu, then Others, then Export.')).toBeTruthy()
  expect(utils.getByText('3')).toBeTruthy()
  expect(utils.getByText(/needs Wallet Premium/)).toBeTruthy()
  fireEvent.press(utils.getByRole('link', { name: 'Still stuck? See Wallet’s own guide' }))
  expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/support\.budgetbakers\.com\//))
})

it('shows how to export from the picked app, then what it read', async () => {
  const { getByText, findByText } = toReview()
  expect(getByText('Tap Export to file.')).toBeTruthy()
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
  expect(getByLabelText('Payday, the 2nd of the month')).toBeTruthy()
})

it('picks the payday from a day-of-month sheet', async () => {
  const { findByLabelText, getByLabelText, getByText } = toReview()
  fireEvent.press(await findByLabelText('Payday, the 1st of the month'))
  fireEvent.press(getByLabelText('The 28th'))
  expect(getByLabelText('Payday, the 28th of the month')).toBeTruthy()
  fireEvent.press(getByText('Looks right, set me up'))
  await waitFor(() => expect(mockCommit.mock.calls[0][1]).toMatchObject({ salary: { amount: 3000, day: 28 } }))
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

it('says why a file without categories lands in one envelope', async () => {
  mockPreview.mockResolvedValue({ ...review, categories: [{ source: 'Uncategorised', name: 'Uncategorised', group: 'Essentials', monthly: 27500 }] })
  const { findByText } = toReview()
  expect(await findByText('Your file doesn’t have categories, so every spend starts in this one envelope. Rename it here, or split it up later from Categories.')).toBeTruthy()
})

it('names an unrecognised file by what the user picked, not the cache copy the server saw', async () => {
  mockPick.mockResolvedValue({ uri: 'file:///cache/57d5c570.csv', name: 'hdfc-statement.csv', mimeType: 'text/csv', size: 10 })
  mockPreview.mockResolvedValue({ ...review, app: 'generic', filename: '57d5c570.csv' })
  const utils = render()
  fireEvent.press(utils.getByText('I’m switching apps'))
  fireEvent.press(utils.getByText('Continue'))
  fireEvent.press(utils.getByText('Using something else? Pick any csv or xlsx'))
  fireEvent.press(utils.getByLabelText('Choose your export file'))
  expect(await utils.findByText('hdfc-statement.csv')).toBeTruthy()
  expect(utils.queryByText('57d5c570.csv')).toBeNull()
})

it('stops a PDF before uploading it, with words that say what to export instead', async () => {
  mockPick.mockResolvedValue({ uri: 'file:///statement.pdf', name: 'statement.pdf', mimeType: 'application/pdf', size: 2000 })
  const { findByText } = toReview('YNAB')
  expect(await findByText('That’s a PDF. We need the spreadsheet, so export as csv or Excel instead.')).toBeTruthy()
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

it('going back during a slow preview stays back when it lands', async () => {
  let land: (r: ImportReview) => void = () => {}
  mockPreview.mockReturnValue(new Promise<ImportReview>((r) => { land = r }))
  const { getByLabelText, getByText, queryByText } = toReview()
  await waitFor(() => expect(mockPreview).toHaveBeenCalled())
  fireEvent.press(getByLabelText('Go back'))
  await act(async () => land(review))
  expect(getByText('Where are you coming from?')).toBeTruthy()
  expect(queryByText('Here’s what we found')).toBeNull()
})

it('names the step being written while the commit runs, like Finish setup does', async () => {
  let land: (r: unknown) => void = () => {}
  mockCommit.mockReturnValue(new Promise((r) => { land = r }))
  const { findByText, getByText, getByLabelText } = toReview()
  fireEvent.press(await findByText('Looks right, set me up'))
  expect(getByText('Making your 2 envelopes…')).toBeTruthy()
  expect(getByLabelText('Making your 2 envelopes…').props.accessibilityState).toMatchObject({ busy: true, disabled: true })
  await act(async () => land({ importId: 'imp1', total: 9, groupCount: 2, categoryCount: 2, income: 3000 }))
})

it('names the app the file really came from, even when another was picked', async () => {
  mockPreview.mockResolvedValue({ ...review, app: 'moneymanager' })
  const { findByText, queryByText } = toReview('Wallet, BudgetBakers')
  expect(await findByText('Money Manager export')).toBeTruthy()
  expect(queryByText('Wallet export')).toBeNull()
})

it('asks for the file the picked app exports, and keeps a button in thumb reach', () => {
  const { getByText, getByLabelText } = render()
  fireEvent.press(getByText('I’m switching apps'))
  fireEvent.press(getByText('Continue'))
  fireEvent.press(getByLabelText('Wallet, BudgetBakers'))
  expect(getByText('csv · up to 4 MB')).toBeTruthy()
  fireEvent.press(getByText('Choose your file'))
  expect(mockPick).toHaveBeenCalled()
})
