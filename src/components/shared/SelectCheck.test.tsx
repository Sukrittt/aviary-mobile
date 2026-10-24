import Svg from 'react-native-svg'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { SelectCheck, SelectTint } from './SelectCheck'

it.each([
  [false, false],
  [true, false],
  [true, true],
])('renders the tick slot and wash (selecting=%s, selected=%s)', (selecting, selected) => {
  const { toJSON } = renderWithProviders(
    <>
      <SelectCheck selecting={selecting} selected={selected} gap={12} />
      <SelectTint selected={selected} />
    </>,
  )
  expect(toJSON()).toBeTruthy()
})

// Every list row carries a tick, and Android re-attaches each one on a tab switch.
it('only mounts the tick while selecting', () => {
  const tick = (selecting: boolean) =>
    renderWithProviders(<SelectCheck selecting={selecting} selected={false} gap={12} />).UNSAFE_queryAllByType(Svg)
  expect(tick(false)).toHaveLength(0)
  expect(tick(true)).toHaveLength(1)
})
