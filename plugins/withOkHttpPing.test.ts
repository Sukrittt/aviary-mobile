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
    expect(out).toMatch(/super\.onCreate\(\)\n\s+\/\/ withOkHttpPing/)
    expect(out).toContain('OkHttpClientProvider.setOkHttpClientFactory {')
    expect(out).toContain('.pingInterval(5, TimeUnit.SECONDS)')
    // One pool for every client the factory builds (RN's networking and
    // expo/fetch each build their own), so evicting it reaches both.
    expect(out).toContain('.connectionPool(okHttpPool)')
    // Before React Native loads, so its networking module builds this client.
    expect(out.indexOf('setOkHttpClientFactory')).toBeLessThan(out.indexOf('loadReactNative'))
  })

  it('drops idle connections on foreground, on background and after a failed call', () => {
    const out = addOkHttpPing(MAIN_APPLICATION)
    // Already on an OkHttp worker: evict right away, so the next request
    // can't grab the stale socket before a queued eviction runs.
    expect(out).toMatch(/override fun callFailed\(call: okhttp3\.Call, ioe: java\.io\.IOException\) = okHttpPool\.evictAll\(\)/)
    expect(out).toMatch(/override fun onActivityStarted\(activity: android\.app\.Activity\) = evictIdle\(\)/)
    expect(out).toMatch(/override fun onActivityStopped\(activity: android\.app\.Activity\) = evictIdle\(\)/)
    // Off the main thread: evicting closes TLS sockets, and socket I/O on the
    // main thread throws NetworkOnMainThreadException.
    expect(out).toMatch(/okHttpEvictor\.execute \{ okHttpPool\.evictAll\(\) \}/)
  })

  it('is idempotent across prebuilds', () => {
    const once = addOkHttpPing(MAIN_APPLICATION)
    expect(addOkHttpPing(once)).toBe(once)
  })

  it('fails loudly when the template changes shape', () => {
    expect(() => addOkHttpPing('package x\n\nclass MainApplication {}\n')).toThrow(/super\.onCreate/)
  })
})
