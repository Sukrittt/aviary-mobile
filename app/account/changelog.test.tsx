import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import ChangelogScreen from './changelog'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
}))

const mockList = jest.fn()
jest.mock('@/src/api/changelog', () => ({ listChangelog: () => mockList() }))

it('lists every release with its version, date and highlights', async () => {
  mockList.mockResolvedValue([
    { id: 'r2', platform: 'mobile', title: 'Income schedules', version: '1.4.0', highlights: ['Split income by cadence'], body: '', publishedAt: '2026-10-01T00:00:00Z' },
    { id: 'r1', platform: 'mobile', title: 'Bill scans', version: '1.3.0', highlights: ['Scan a bill'], body: 'Longer notes', publishedAt: null },
  ])
  const { findByText, getByText } = renderWithProviders(<ChangelogScreen />)

  expect(await findByText('Income schedules')).toBeTruthy()
  expect(getByText('1.4.0 · Oct 1, 2026')).toBeTruthy()
  expect(getByText('Split income by cadence')).toBeTruthy()
  expect(getByText('1.3.0')).toBeTruthy()
  expect(getByText('Longer notes')).toBeTruthy()
})

it('says so when nothing has shipped yet', async () => {
  mockList.mockResolvedValue([])
  const { findByText } = renderWithProviders(<ChangelogScreen />)
  expect(await findByText("Updates show up here once they're out.")).toBeTruthy()
})

it('offers a retry when the changelog fails to load', async () => {
  mockList.mockRejectedValueOnce(new Error('503')).mockResolvedValueOnce([
    { id: 'r1', platform: 'mobile', title: 'Bill scans', version: '1.3.0', highlights: [], body: '', publishedAt: null },
  ])
  const { findByText } = renderWithProviders(<ChangelogScreen />)
  fireEvent.press(await findByText('Try again'))
  expect(await findByText('Bill scans')).toBeTruthy()
})
