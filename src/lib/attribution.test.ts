import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Application from 'expo-application'

jest.mock('expo-application', () => ({ getInstallReferrerAsync: jest.fn() }))
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }))

const referrer = Application.getInstallReferrerAsync as jest.Mock

async function fresh() {
  let mod!: typeof import('./attribution')
  jest.isolateModules(() => { mod = require('./attribution') })
  return mod
}

beforeEach(async () => {
  await AsyncStorage.clear()
  referrer.mockReset()
})

it('keeps the fields the server stores, with the code uppercased', async () => {
  const { parseInstallReferrer } = await fresh()
  expect(parseInstallReferrer('utm_source=reddit&utm_medium=comment&utm_campaign=r%2Fx&ref=k7qm4p&gclid=abc')).toEqual({
    utm_source: 'reddit', utm_medium: 'comment', utm_campaign: 'r/x', referral_code: 'K7QM4P',
  })
  expect(parseInstallReferrer('utm_source=google-play&utm_medium=organic')).toEqual({ utm_source: 'google-play', utm_medium: 'organic' })
  expect(parseInstallReferrer('ref=<x>')).toEqual({})
})

it('sends the install referrer until the profile loads, then stops', async () => {
  referrer.mockResolvedValue('utm_source=reddit')
  const a = await fresh()
  await a.captureInstallReferrer()
  expect(a.attributionHeaders()).toEqual({ 'x-aviary-attribution': '{"utm_source":"reddit"}' })
  await a.clearAttribution()
  expect(a.attributionHeaders()).toEqual({})

  // A later launch doesn't ask Play again or bring it back.
  const b = await fresh()
  await b.captureInstallReferrer()
  expect(referrer).toHaveBeenCalledTimes(1)
  expect(b.attributionHeaders()).toEqual({})
})

it('survives the app being killed before sign-in', async () => {
  referrer.mockResolvedValue('utm_source=instagram')
  await (await fresh()).captureInstallReferrer()
  const relaunched = await fresh()
  await relaunched.captureInstallReferrer()
  expect(relaunched.attributionHeaders()).toEqual({ 'x-aviary-attribution': '{"utm_source":"instagram"}' })
})

it('tries again next launch when Play can\'t answer', async () => {
  referrer.mockRejectedValueOnce(new Error('SERVICE_UNAVAILABLE')).mockResolvedValueOnce('utm_source=x')
  const a = await fresh()
  await a.captureInstallReferrer()
  expect(a.attributionHeaders()).toEqual({})
  const b = await fresh()
  await b.captureInstallReferrer()
  expect(b.attributionHeaders()).toEqual({ 'x-aviary-attribution': '{"utm_source":"x"}' })
})
