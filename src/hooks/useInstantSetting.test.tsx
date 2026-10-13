import { useState } from 'react'
import { act, renderHook } from '@testing-library/react-native'
import { useInstantSetting } from './useInstantSetting'

describe('useInstantSetting', () => {
  it('shows and commits the new value', async () => {
    const { result } = renderHook(() => {
      const [value, setValue] = useState(false)
      const [shown, set] = useInstantSetting(value, setValue)
      return { value, shown, set }
    })
    await act(async () => result.current.set(true))
    expect(result.current.shown).toBe(true)
    expect(result.current.value).toBe(true)
  })

  it('falls back to the committed value when the commit throws', async () => {
    const { result } = renderHook(() => {
      const [shown, set] = useInstantSetting('light', () => {
        throw new Error('nope')
      })
      return { shown, set }
    })
    await act(async () => {
      try {
        result.current.set('dark')
      } catch {}
    })
    expect(result.current.shown).toBe('light')
  })
})
