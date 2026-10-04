import { useCallback, useState } from 'react';
import { pushAmountKey } from '@/src/lib/calcAmount';
import { useInvalidFeedback } from './useInvalidFeedback';

/** Shared numpad editing; screens can reset dependent allocation state after an edit. */
export function useAmountEntry(initial = '', options: { onChange?: () => void; shakeAtZero?: boolean } = {}) {
  const [amount, setAmount] = useState(initial)
  const { shake, triggerInvalidFeedback } = useInvalidFeedback()
  const { onChange, shakeAtZero = false } = options
  const pushDigit = useCallback((digit: string) => {
    setAmount(prev => pushAmountKey(prev, digit))
    onChange?.()
  }, [onChange])
  const handleBackspace = useCallback(() => {
    if (shakeAtZero ? Number(amount) === 0 : amount === '') {
      triggerInvalidFeedback()
      return
    }
    setAmount(prev => prev.slice(0, -1))
    onChange?.()
  }, [amount, onChange, shakeAtZero, triggerInvalidFeedback])
  return { amount, setAmount, pushDigit, handleBackspace, shake }
}
