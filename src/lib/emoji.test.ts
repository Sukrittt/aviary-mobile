import { splitEmoji, categoryTint, chartInk } from './emoji'

describe('splitEmoji', () => {
  it('splits a leading emoji from text', () => {
    expect(splitEmoji('🏠 Rent')).toEqual({ icon: '🏠', text: 'Rent' })
    expect(splitEmoji('👨🏽‍🍳 Cook')).toEqual({ icon: '👨🏽‍🍳', text: 'Cook' })
    expect(splitEmoji('👍🏽 Tips')).toEqual({ icon: '👍🏽', text: 'Tips' })
  })

  it('handles a ZWJ sequence emoji (cook)', () => {
    expect(splitEmoji('👨‍🍳 Cook')).toEqual({ icon: '👨‍🍳', text: 'Cook' })
  })

  it('passes through text with no leading emoji', () => {
    expect(splitEmoji('Plain Name')).toEqual({ icon: '', text: 'Plain Name' })
  })

  it('falls back to the full trimmed string when the emoji is the whole value', () => {
    expect(splitEmoji('🏠')).toEqual({ icon: '', text: '🏠' })
  })
})

describe('categoryTint', () => {
  const tokens = {
    mint: 'm', mintSoft: 'ms', violet: 'v', violetSoft: 'vs', blue: 'b', blueSoft: 'bs',
    accentInk: 'a', accentSoft: 'as', warnInk: 'w', warnSoft: 'ws', coral: 'c', coralSoft: 'cs',
  }

  it('gives the same name the same tint', () => {
    expect(categoryTint('Groceries', tokens)).toEqual(categoryTint('Groceries', tokens))
  })

  it('ignores a leading emoji', () => {
    expect(categoryTint('🛒 Groceries', tokens)).toEqual(categoryTint('Groceries', tokens))
  })

  it('pairs a soft background with its ink', () => {
    const { bg, ink } = categoryTint('Rent', tokens)
    expect(bg).toBe(`${ink}s`)
  })
})

describe('chartInk', () => {
  it('softens a light-mode ink 15% toward white', () => {
    expect(chartInk('#af25a9', 'light')).toBe('#bb46b6')
    expect(chartInk('#000000', 'light')).toBe('#262626')
  })

  it('leaves dark-mode inks alone', () => {
    expect(chartInk('#e76edf', 'dark')).toBe('#e76edf')
  })

  it('passes through anything that is not a 6-digit hex', () => {
    expect(chartInk('rgba(0, 0, 0, 0.5)', 'light')).toBe('rgba(0, 0, 0, 0.5)')
  })
})
