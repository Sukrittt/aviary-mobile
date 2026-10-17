import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { TrendChart, barFill } from './TrendChart'
import { darkTokens, lightTokens } from '@/src/theme/tokens'

it('shows the empty illustration once there is genuinely no data', () => {
  const screen = renderWithProviders(<TrendChart data={[]} />)
  expect(screen.getByTestId('trend-empty')).toBeTruthy()
})

it('hides the empty illustration while data is still loading', () => {
  const screen = renderWithProviders(<TrendChart data={[]} loading />)
  expect(screen.queryByTestId('trend-empty')).toBeNull()
  expect(screen.getByTestId('tab-skeleton')).toBeTruthy()
})

describe('barFill', () => {
  it('dims past months to a neutral fill in dark instead of see-through accent', () => {
    expect(barFill(darkTokens, 'dark', 500, true)).toEqual({ fill: darkTokens.chipActiveBg, fillOpacity: 1 })
    expect(barFill(darkTokens, 'dark', -500, true)).toEqual({ fill: darkTokens.chipActiveBg, fillOpacity: 1 })
  })

  it('keeps the highlighted month in colour in dark', () => {
    expect(barFill(darkTokens, 'dark', 500, false)).toEqual({ fill: darkTokens.accent, fillOpacity: 1 })
    expect(barFill(darkTokens, 'dark', -500, false)).toEqual({ fill: darkTokens.coral, fillOpacity: 1 })
  })

  it('leaves light dimming as it was', () => {
    expect(barFill(lightTokens, 'light', 500, true)).toEqual({ fill: lightTokens.accent, fillOpacity: 0.42 })
  })
})
