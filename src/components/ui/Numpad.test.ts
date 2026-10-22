import { typeDigits } from './Numpad'

it('appends digits and drops leading zeros', () => {
  expect(typeDigits('', '0', 8)).toBe('')
  expect(typeDigits('12', '3', 8)).toBe('123')
  expect(typeDigits('5', '00', 8)).toBe('500')
})

// The 00 key adds two digits at once; cutting one off at the cap logged a tenth of what was typed.
it('ignores a key that would go past the cap instead of cutting it short', () => {
  expect(typeDigits('1234567', '00', 8)).toBe('1234567')
  expect(typeDigits('1234567', '0', 8)).toBe('12345670')
  expect(typeDigits('12345678', '9', 8)).toBe('12345678')
})
