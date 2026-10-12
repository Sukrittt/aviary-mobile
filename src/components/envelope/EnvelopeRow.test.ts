import { availablePill } from './EnvelopeRow'
import { lightTokens as t } from '@/src/theme/tokens'
import type { Envelope } from '@/src/lib/envelope'

const env = (spentPct: number, isOverspent = false) => ({ spentPct, isOverspent }) as Envelope

describe('availablePill', () => {
  it('follows the progress bar: green, then amber, then red as it empties', () => {
    expect(availablePill(env(20), t)).toEqual({ color: t.pillGood, bg: t.pillGoodBg })
    expect(availablePill(env(80), t)).toEqual({ color: t.pillLow, bg: t.pillLowBg })
    expect(availablePill(env(95), t)).toEqual({ color: t.pillOver, bg: t.pillOverBg })
  })

  it('is red whenever the envelope is overspent', () => {
    expect(availablePill(env(100, true), t)).toEqual({ color: t.pillOver, bg: t.pillOverBg })
  })

  it('drops the pill for an envelope spent exactly to zero', () => {
    expect(availablePill(env(100), t)).toEqual({ color: t.text3, bg: 'transparent' })
  })
})
