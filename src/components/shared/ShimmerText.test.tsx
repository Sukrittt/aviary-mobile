import { render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import * as reanimated from 'react-native-reanimated'
import { ShimmerText } from './ShimmerText'

describe('ShimmerText', () => {
  it('splits a looping label into lit letters, still read as one label', () => {
    const { getByLabelText, queryByText } = render(<ShimmerText loop text="Picking…" />)
    expect(getByLabelText('Picking…')).toBeTruthy()
    expect(queryByText('Picking…')).toBeNull()
    expect(queryByText('P')).toBeTruthy()
  })

  it('goes back to plain text at full strength once a single pass is over', () => {
    const { getByText } = render(<ShimmerText text="Set" />)
    expect(StyleSheet.flatten(getByText('Set').props.style)?.opacity).toBeUndefined()
  })

  it('keeps nudging, resting at full strength between passes', () => {
    const { getByLabelText, getByText, queryByText } = render(<ShimmerText nudge text="Set" />)
    expect(getByLabelText('Set')).toBeTruthy()
    expect(queryByText('Set')).toBeNull()
    expect(StyleSheet.flatten(getByText('S').props.style)?.opacity).toBe(1)
  })

  it('stays plain text when off', () => {
    expect(render(<ShimmerText loop on={false} text="Reading…" />).getByText('Reading…')).toBeTruthy()
  })

  it('stays plain text under reduced motion', () => {
    const spy = jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true)
    expect(render(<ShimmerText loop text="Reading…" />).getByText('Reading…')).toBeTruthy()
    spy.mockRestore()
  })
})
