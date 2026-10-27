import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'
import { rippleHaptic, rippleTickTimes, tap, wheelTick } from './haptics'

describe('rippleTickTimes', () => {
  it('gives one tick per item, starting immediately', () => {
    expect(rippleTickTimes(3)).toEqual([0, 83, 167])
  })

  it('caps long lists at 12 ticks inside the ripple window', () => {
    const times = rippleTickTimes(40)
    expect(times).toHaveLength(12)
    expect(Math.max(...times)).toBeLessThan(250)
  })

  it('gives no ticks for nothing to move', () => {
    expect(rippleTickTimes(0)).toEqual([])
  })
})

describe('tap', () => {
  const os = Platform.OS
  afterEach(() => {
    Platform.OS = os
    jest.restoreAllMocks()
  })

  it('plays a rigid impact on iOS', () => {
    Platform.OS = 'ios'
    const impact = jest.spyOn(Haptics, 'impactAsync').mockResolvedValue()
    tap()
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Rigid)
  })

  it('plays the system clock tick on Android, not the buzzy impact fallback', () => {
    Platform.OS = 'android'
    const impact = jest.spyOn(Haptics, 'impactAsync').mockResolvedValue()
    const android = jest.spyOn(Haptics, 'performAndroidHapticsAsync').mockResolvedValue()
    tap()
    expect(android).toHaveBeenCalledWith(Haptics.AndroidHaptics.Clock_Tick)
    expect(impact).not.toHaveBeenCalled()
  })
})

describe('rippleHaptic', () => {
  it('stays silent when nothing moved', () => {
    jest.useFakeTimers()
    const impact = jest.spyOn(Haptics, 'impactAsync').mockResolvedValue()
    rippleHaptic(0)
    jest.runAllTimers()
    expect(impact).not.toHaveBeenCalled()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })
})

describe('wheelTick', () => {
  const os = Platform.OS
  afterEach(() => {
    Platform.OS = os
    jest.restoreAllMocks()
  })

  it("is the light clock tick on Android, not selection's buzzy fallback", () => {
    Platform.OS = 'android'
    const selection = jest.spyOn(Haptics, 'selectionAsync').mockResolvedValue()
    const android = jest.spyOn(Haptics, 'performAndroidHapticsAsync').mockResolvedValue()
    wheelTick()
    expect(android).toHaveBeenCalledWith(Haptics.AndroidHaptics.Clock_Tick)
    expect(selection).not.toHaveBeenCalled()
  })

  it("is iOS's own picker tick on iOS", () => {
    Platform.OS = 'ios'
    const selection = jest.spyOn(Haptics, 'selectionAsync').mockResolvedValue()
    wheelTick()
    expect(selection).toHaveBeenCalled()
  })
})
