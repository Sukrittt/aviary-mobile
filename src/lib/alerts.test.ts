import { ALERT_PRESET_PCTS, DEFAULT_ALERT_PCTS, MAX_ALERT_PCTS } from './alerts'

describe('alerts thresholds and presets', () => {
  it('exports expected DEFAULT_ALERT_PCTS values in ascending order', () => {
    expect(DEFAULT_ALERT_PCTS).toEqual([50, 90, 100])
  })

  it('exports expected ALERT_PRESET_PCTS values in ascending order', () => {
    expect(ALERT_PRESET_PCTS).toEqual([25, 50, 75, 90, 100])
  })

  it('enforces MAX_ALERT_PCTS limit across defaults and presets', () => {
    expect(MAX_ALERT_PCTS).toBe(5)
    expect(DEFAULT_ALERT_PCTS.length).toBeLessThanOrEqual(MAX_ALERT_PCTS)
    expect(ALERT_PRESET_PCTS.length).toBeLessThanOrEqual(MAX_ALERT_PCTS)
  })

  it('ensures every default threshold is included in the preset list and bounded within 1..100', () => {
    for (const pct of DEFAULT_ALERT_PCTS) {
      expect(ALERT_PRESET_PCTS).toContain(pct)
      expect(pct).toBeGreaterThan(0)
      expect(pct).toBeLessThanOrEqual(100)
    }
  })
})
