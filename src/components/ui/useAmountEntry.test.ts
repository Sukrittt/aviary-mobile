import { act, renderHook } from '@testing-library/react-native'
import { useAmountEntry } from './useAmountEntry'

it('backspaces out of a bare decimal when shaking at zero', () => {
  const { result } = renderHook(() => useAmountEntry('', { shakeAtZero: true }))
  act(() => result.current.pushDigit('.'))
  act(() => result.current.pushDigit('0'))
  expect(result.current.amount).toBe('0.0')
  act(() => result.current.handleBackspace())
  expect(result.current.amount).toBe('0.')
  act(() => result.current.handleBackspace())
  expect(result.current.amount).toBe('0')
})

it('blocks backspace on "0" and empty when shaking at zero', () => {
  const onChange = jest.fn()
  const { result } = renderHook(() => useAmountEntry('0', { shakeAtZero: true, onChange }))
  act(() => result.current.handleBackspace())
  expect(result.current.amount).toBe('0')
  act(() => result.current.setAmount(''))
  act(() => result.current.handleBackspace())
  expect(result.current.amount).toBe('')
  expect(onChange).not.toHaveBeenCalled()
})
