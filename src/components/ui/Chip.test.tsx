import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { lightTokens } from '@/src/theme/tokens'
import { Chip } from './Chip'

describe('Chip', () => {
  it('renders a plain label with no icon prop', () => {
    const { getByText } = renderWithProviders(<Chip label="Reorder" onPress={() => {}} />)
    expect(getByText('Reorder')).toBeTruthy()
  })

  // A ZWJ+variation-selector emoji (person + gender modifier, e.g. the Haircut
  // category's 💇‍♂️) sharing one custom-font Text run with its label can make
  // Android silently drop the rest of that run. Regression test for that: icon
  // and label must be separate Text nodes, not one interpolated string, so
  // each gets independently queryable — a combined "💇‍♂️ Haircut" string in a
  // single node would fail `getByText('Haircut')` below.
  it('renders icon and label as separate text nodes', () => {
    const { getByText } = renderWithProviders(
      <Chip icon="💇‍♂️" label="Haircut" onPress={() => {}} />,
    )
    expect(getByText('💇‍♂️')).toBeTruthy()
    expect(getByText('Haircut')).toBeTruthy()
  })

  it('omits the icon node entirely when no icon is passed', () => {
    const { queryByText } = renderWithProviders(<Chip label="Reorder" onPress={() => {}} />)
    expect(queryByText('💇‍♂️')).toBeNull()
  })

  it('tints a soft selected chip instead of filling it', () => {
    const { getByText } = renderWithProviders(<Chip label="Open" soft selected onPress={() => {}} />)
    expect(getByText('Open')).toHaveStyle({ color: lightTokens.accentInk })
  })
})
