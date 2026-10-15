import { fireEvent, render } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/src/theme/ThemeProvider'
import { PrivacyProvider } from '@/src/context/PrivacyContext'
import { createTestQueryClient, renderWithProviders } from '@/src/test-utils/renderWithProviders'
import type { WrappedData, WrappedStory } from '@/src/api/wrapped'
import { WrappedScreen, buildSlides } from './WrappedScreen'

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }))
jest.mock('@/src/hooks/useWrappedMusic', () => ({ useWrappedMusic: () => {} }))
const mockUseWrapped = jest.fn()
jest.mock('@/src/hooks/useWrapped', () => ({
  useWrapped: () => mockUseWrapped(),
  useWrappedJudgement: () => ({ data: undefined }),
}))

it.each([
  ['a 503', new Error('Failed to load wrapped: 503')],
  ['a transport failure', new TypeError('Network request failed')],
])('writes its own line for %s instead of the raw error', (_, error) => {
  mockUseWrapped.mockReturnValue({ data: undefined, isLoading: false, error })
  const { getByText, queryByText } = renderWithProviders(<WrappedScreen />)
  expect(getByText("Couldn't load your Wrapped. Check your connection and try again.")).toBeTruthy()
  expect(queryByText(error.message)).toBeNull()
})

it('keeps the deck it started with when a refetch changes the data mid-playback', () => {
  const recap = (totalSpent: number, stories: WrappedStory[]) =>
    ({
      month: '2026-09',
      range: { startDate: '2026-09-01', endDate: '2026-09-30', daysTracked: 20 },
      totalSpent,
      totalTransactions: 19,
      topCategories: [],
      biggestPurchase: null,
      topWeekday: null,
      longestStreak: null,
      longestGap: null,
      weeklyTotals: [],
      stories,
    }) as WrappedData
  const streak = { type: 'streak', group: 'habit', score: 1, variant: 0, facts: { days: 3, startDate: '2026-09-01', endDate: '2026-09-03' } } as WrappedStory
  mockUseWrapped.mockReturnValue({ data: recap(12000, [streak, streak, streak]), isLoading: false, error: null })
  // `wrapper`, not renderWithProviders, so the rerender below keeps the providers.
  const queryClient = createTestQueryClient()
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PrivacyProvider>{children}</PrivacyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
  const screen = render(<WrappedScreen />, { wrapper })
  fireEvent.press(screen.getByText('Silent'))
  expect(screen.getByText(/12,000/)).toBeTruthy()

  // A smaller deck arrives: the viewer stays on the one they started.
  mockUseWrapped.mockReturnValue({ data: recap(99999, []), isLoading: false, error: null })
  screen.rerender(<WrappedScreen />)
  expect(screen.getByText(/12,000/)).toBeTruthy()
  expect(screen.queryByText(/99,999/)).toBeNull()
})

describe('buildSlides', () => {
  const data = { month: '2026-09', topCategories: [], totalSpent: 0, totalTransactions: 0 } as unknown as WrappedData
  const streak = { type: 'streak', group: 'habit', score: 1, variant: 0, facts: { days: 3, startDate: '2026-09-01', endDate: '2026-09-03' } } as WrappedStory
  const noop = () => {}

  it("runs the server's stories between the fixed slides, skipping types this build doesn't know", () => {
    const unknown = { ...streak, type: 'time_travel' } as unknown as WrappedStory
    const slides = buildSlides({ ...data, stories: [streak, unknown, streak] }, null, noop, noop)
    expect(slides.map((s) => s.kind)).toEqual(['cover', 'total', 'streak', 'streak', 'persona', 'share'])
  })

  it('falls back to the fixed slides when the server sends no stories', () => {
    expect(buildSlides(data, null, noop, noop).map((s) => s.kind)).toEqual(['cover', 'total', 'persona', 'share'])
  })

  it('never puts two slides of the same color next to each other', () => {
    const slides = buildSlides({ ...data, stories: Array(9).fill(streak) }, null, noop, noop)
    slides.slice(1).forEach((s, i) => expect(s.bg).not.toBe(slides[i].bg))
  })
})
