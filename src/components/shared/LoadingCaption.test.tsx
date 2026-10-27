import { act } from '@testing-library/react-native'
import * as reanimated from 'react-native-reanimated'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { LoadingCaption } from './LoadingCaption'

describe('LoadingCaption', () => {
  it('cycles through the given phrases over time, shimmering the one showing', () => {
    jest.useFakeTimers()
    const phrases = ['First phrase…', 'Second phrase…', 'Third phrase…']
    const { getByLabelText, queryByLabelText } = renderWithProviders(<LoadingCaption phrases={phrases} />)

    const shown = phrases.find((p) => queryByLabelText(p))
    expect(shown).toBeTruthy()

    act(() => {
      jest.advanceTimersByTime(1800)
    })
    const next = phrases.find((p) => queryByLabelText(p))
    expect(next).toBeTruthy()
    expect(next).not.toBe(shown)
    expect(getByLabelText(next as string)).toBeTruthy()

    jest.useRealTimers()
  })

  it('shows the phrase as plain text under reduced motion', () => {
    const spy = jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true)
    const { getByText } = renderWithProviders(<LoadingCaption ordered phrases={['Only phrase…']} />)
    expect(getByText('Only phrase…')).toBeTruthy()
    spy.mockRestore()
  })
})
