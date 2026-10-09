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
