import { render } from '@testing-library/react-native'

import { BirdLandingSplash } from './BirdLandingSplash'

describe('BirdLandingSplash', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('mounts with valid animation transform origins', () => {
    const tree = render(<BirdLandingSplash />).toJSON()
    const origins: unknown[] = []

    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit)
        return
      }
      if (!value || typeof value !== 'object') return

      Object.entries(value).forEach(([key, child]) => {
        if (key === 'transformOrigin') origins.push(child)
        visit(child)
      })
    }

    visit(tree)

    expect(origins.length).toBeGreaterThan(0)
    origins.forEach(origin => expect(origin).toHaveLength(3))
  })
})

it('shows the perched bird nodding and blinking instead of the landing swoop', () => {
  const { Animated } = jest.requireActual('react-native')
  const loopSpy = jest.spyOn(Animated, 'loop')
  const view = render(<BirdLandingSplash />)
  // Perched nod + blink start from mount (no landing first).
  expect(loopSpy).toHaveBeenCalledTimes(2)
  view.unmount()
  loopSpy.mockRestore()
})
