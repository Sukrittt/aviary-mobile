import { createRef } from 'react'
import { Animated } from 'react-native'
import { act, render } from '@testing-library/react-native'
import { BirdLandingMark, type BirdLandingMarkHandle } from './BirdLandingMark'

it('pins opacity to zero before revealing the reset bird', () => {
  const realTiming = Animated.timing
  let finishFadeOut: (() => void) | undefined
  const timingSpy = jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    const animation = realTiming(value, config)
    if (config.toValue === 0 && config.duration === 180) {
      return {
        ...animation,
        start: (callback) => {
          finishFadeOut = () => callback?.({ finished: true })
        },
      }
    }
    return animation
  })
  const setValueSpy = jest.spyOn(Animated.Value.prototype, 'setValue')
  const ref = createRef<BirdLandingMarkHandle>()

  const view = render(<BirdLandingMark ref={ref} size={56} color="#000000" autoplay={false} />)
  act(() => ref.current?.replay())
  act(() => finishFadeOut?.())

  const fadeInCall = timingSpy.mock.calls.find(([, config]) => config.toValue === 1 && config.duration === 220)
  expect(fadeInCall).toBeTruthy()
  const opacity = fadeInCall?.[0]
  const opacityWasReset = setValueSpy.mock.instances.some(
    (instance, index) => instance === opacity && setValueSpy.mock.calls[index][0] === 0,
  )
  expect(opacityWasReset).toBe(true)

  view.unmount()
  timingSpy.mockRestore()
  setValueSpy.mockRestore()
})

it('starts the idle nod and blink loops only when perched', () => {
  const loopSpy = jest.spyOn(Animated, 'loop')

  const resting = render(<BirdLandingMark size={56} color="#000000" autoplay={false} />)
  expect(loopSpy).not.toHaveBeenCalled()
  resting.unmount()

  const perched = render(<BirdLandingMark size={56} color="#000000" autoplay={false} perched />)
  expect(loopSpy).toHaveBeenCalledTimes(2)
  perched.unmount()

  loopSpy.mockRestore()
})
