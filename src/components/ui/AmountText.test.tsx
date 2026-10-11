import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Animated } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/src/theme/ThemeProvider'
import { PrivacyProvider, usePrivacy } from '@/src/context/PrivacyContext'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import * as Haptics from 'expo-haptics'
import { AmountText } from './AmountText'

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}))

function wrapWithProviders(ui: ReactElement, queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PrivacyProvider>{ui}</PrivacyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

// Renders inside PrivacyProvider with the hide-amounts toggle forced on, so a
// test can assert how a component behaves when amounts are masked.
function WithHideAmounts({ children }: { children: ReactElement }) {
  const { setHideAmounts } = usePrivacy()
  useEffect(() => {
    setHideAmounts(true)
  }, [setHideAmounts])
  return children
}

function wrapHiddenWithProviders(ui: ReactElement, queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PrivacyProvider>
          <WithHideAmounts>{ui}</WithHideAmounts>
        </PrivacyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

describe('AmountText', () => {
  it('formats with Indian digit grouping', () => {
    const { getByText } = renderWithProviders(<AmountText value={125000} size={20} />)
    expect(getByText('₹1,25,000')).toBeTruthy()
  })

  it('renders negatives with a leading sign', () => {
    const { getByText } = renderWithProviders(<AmountText value={-450} size={20} />)
    expect(getByText('-₹450')).toBeTruthy()
  })

  it('splits an animated amount into one node per character but keeps the label whole', () => {
    // The odometer renders each char separately, so the full string is only
    // recoverable from the accessibility label — which is what a screen reader reads.
    const { getByLabelText, queryByText } = renderWithProviders(<AmountText value={1200} size={40} animate />)
    expect(getByLabelText('₹1,200')).toBeTruthy()
    expect(queryByText('₹1,200')).toBeNull()
  })

  it('swaps the symbol/comma statically when shrinking crosses a grouping boundary', () => {
    // Right-aligned diffing pairs old ',' with new '₹' and old '0' with new
    // '1' when "1000" -> "100" removes the comma. Those must render
    // statically (no stacked old-char frame), or the odometer freezes on
    // ",000" until the roll finishes.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { rerender, queryByText } = renderWithProviders(<AmountText value={1000} size={40} animate />)
    rerender(wrapWithProviders(<AmountText value={100} size={40} animate />, queryClient))
    expect(queryByText(',')).toBeNull()
  })

  it('rolls a digit slot even when its new value repeats an earlier resting value', () => {
    // Right-aligned diffing means a slot's newChar can be the same character
    // across two different renders even though the slot only just became
    // "changed" (e.g. index 1 is '1' in both "₹1,000" and "₹100"). A roll
    // effect keyed only on [newChar] never fires here, freezing the slot on
    // its old character forever — the "shows 00 instead of 10" bug.
    const timingSpy = jest.spyOn(Animated, 'timing')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { rerender } = renderWithProviders(<AmountText value={100} size={40} animate />)
    timingSpy.mockClear()
    rerender(wrapWithProviders(<AmountText value={10} size={40} animate />, queryClient))
    expect(timingSpy).toHaveBeenCalled()
    timingSpy.mockRestore()
  })

  it('rolls up when the value increases and down when it decreases', () => {
    const timingSpy = jest.spyOn(Animated, 'timing')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })

    const { rerender } = renderWithProviders(<AmountText value={100} size={40} animate />)
    timingSpy.mockClear()
    rerender(wrapWithProviders(<AmountText value={200} size={40} animate />, queryClient))
    // Increase: rolls up, toValue is negative.
    expect(timingSpy.mock.calls[0][1].toValue).toBeLessThan(0)

    timingSpy.mockClear()
    rerender(wrapWithProviders(<AmountText value={50} size={40} animate />, queryClient))
    // Decrease: rolls down, toValue is 0 (started from a negative offset).
    expect(timingSpy.mock.calls[0][1].toValue).toBe(0)

    timingSpy.mockRestore()
  })

  it('rolls when digit count shrinks even if the surviving digit coincidentally matches', () => {
    // ₹400 -> ₹0: right-aligning pairs the '0' both had in their ones place,
    // and the '4'/'0' higher-order digits aren't rendered at all in the
    // shorter new text — without forcing a roll on length change, this
    // specific transition animates nothing at all.
    const timingSpy = jest.spyOn(Animated, 'timing')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { rerender } = renderWithProviders(<AmountText value={400} size={40} animate />)
    timingSpy.mockClear()
    rerender(wrapWithProviders(<AmountText value={0} size={40} animate />, queryClient))
    expect(timingSpy).toHaveBeenCalled()
    timingSpy.mockRestore()
  })

  it('rolls after a remount when an id seeds the previous value from the last mount', () => {
    // Home's Ready to Assign remounts on tab blur/focus (see app/_layout.tsx),
    // so a fresh Odometer instance must still know the pre-change value to
    // diff against instead of treating the already-updated value as its own start.
    const timingSpy = jest.spyOn(Animated, 'timing')
    const { unmount } = renderWithProviders(<AmountText value={100} size={40} animate id="test-remount" />)
    unmount()

    timingSpy.mockClear()
    renderWithProviders(<AmountText value={200} size={40} animate id="test-remount" />)
    expect(timingSpy).toHaveBeenCalled()
    timingSpy.mockRestore()
  })

  it('uses tabular figures so digits do not shift width', () => {
    const { getByText } = renderWithProviders(<AmountText value={999} size={20} />)
    const flat = getByText('₹999').props.style.flat()
    expect(Object.assign({}, ...flat).fontVariant).toEqual(['tabular-nums'])
  })

  it('masks the amount when the hide toggle is on', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { getByText } = renderWithProviders(wrapHiddenWithProviders(<AmountText value={1200} size={20} />, queryClient))
    expect(getByText('₹••••')).toBeTruthy()
  })

  it('keeps the amount visible on the log screen even when hide is on', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { getByText } = renderWithProviders(
      wrapHiddenWithProviders(<AmountText value={1200} size={20} ignoreHide />, queryClient),
    )
    expect(getByText('₹1,200')).toBeTruthy()
  })

  it('keeps an in-progress numpad string visible when hide is on', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { getByText } = renderWithProviders(
      wrapHiddenWithProviders(<AmountText value={1200} size={20} rawText="1200." ignoreHide />, queryClient),
    )
    expect(getByText('1200.')).toBeTruthy()
  })

  describe('settle', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.clearAllMocks()
    })
    afterEach(() => jest.useRealTimers())

    it('ticks once per changed digit, then lands', () => {
      const queryClient = new QueryClient()
      const { rerender } = renderWithProviders(<AmountText value={1000} size={40} animate settle />)
      jest.runAllTimers()
      expect(Haptics.selectionAsync).not.toHaveBeenCalled()

      rerender(wrapWithProviders(<AmountText value={1250} size={40} animate settle />, queryClient))
      jest.runAllTimers()
      expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2)
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(1)
    })

    it('stays silent without the prop', () => {
      const queryClient = new QueryClient()
      const { rerender } = renderWithProviders(<AmountText value={1000} size={40} animate />)
      rerender(wrapWithProviders(<AmountText value={1250} size={40} animate />, queryClient))
      jest.runAllTimers()
      expect(Haptics.selectionAsync).not.toHaveBeenCalled()
    })
  })
})
