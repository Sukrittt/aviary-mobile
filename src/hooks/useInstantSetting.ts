import { startTransition, useOptimistic } from 'react'

// Theme and hide-amounts live at the app root, so committing either re-renders
// every mounted screen and the control that changed it sat frozen for seconds.
// The control shows the new value right away; the app-wide re-render runs as an
// interruptible transition behind it, and the shown value falls back to the
// committed one if that never lands.
export function useInstantSetting<T>(value: T, commit: (next: T) => void): [T, (next: T) => void] {
  const [shown, setShown] = useOptimistic(value)
  const set = (next: T) =>
    startTransition(() => {
      setShown(next)
      commit(next)
    })
  return [shown, set]
}
