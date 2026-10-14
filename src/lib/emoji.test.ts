import { splitEmoji, categoryTint } from './emoji'

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
