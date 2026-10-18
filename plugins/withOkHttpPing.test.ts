// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addOkHttpPing } = require('./withOkHttpPing')

const MAIN_APPLICATION = `package com.example.app

import android.app.Application

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
`

describe('addOkHttpPing', () => {
  it('installs the ping factory right after super.onCreate()', () => {
    const out = addOkHttpPing(MAIN_APPLICATION)
    expect(out).toContain('import com.facebook.react.modules.network.OkHttpClientProvider')
    expect(out).toContain('import java.util.concurrent.TimeUnit')
    expect(out).toMatch(/super\.onCreate\(\)\n\s+\/\/ withOkHttpPing[^\n]*\n\s+OkHttpClientProvider\.setOkHttpClientFactory \{\n\s+OkHttpClientProvider\.createClientBuilder\(this\)\.pingInterval\(10, TimeUnit\.SECONDS\)\.build\(\)/)
    // Before React Native loads, so its networking module builds this client.
    expect(out.indexOf('setOkHttpClientFactory')).toBeLessThan(out.indexOf('loadReactNative'))
  })

  it('is idempotent across prebuilds', () => {
    const once = addOkHttpPing(MAIN_APPLICATION)
    expect(addOkHttpPing(once)).toBe(once)
  })

  it('fails loudly when the template changes shape', () => {
    expect(() => addOkHttpPing('package x\n\nclass MainApplication {}\n')).toThrow(/super\.onCreate/)
  })
})
