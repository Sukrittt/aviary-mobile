// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addOkHttpClient } = require('./withOkHttpClient')

const MAIN_APPLICATION = `package com.example.app

import android.app.Application

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
`

describe('addOkHttpClient', () => {
  it('installs the client factory right after super.onCreate()', () => {
    const out = addOkHttpClient(MAIN_APPLICATION)
    expect(out).toContain('import com.facebook.react.modules.network.OkHttpClientProvider')
    expect(out).toContain('import java.util.concurrent.TimeUnit')
    expect(out).toMatch(/super\.onCreate\(\)\n\s+\/\/ withOkHttpClient/)
    expect(out).toContain('OkHttpClientProvider.setOkHttpClientFactory {')
    // Before React Native loads, so its networking module builds this client.
    expect(out.indexOf('setOkHttpClientFactory')).toBeLessThan(out.indexOf('loadReactNative'))
  })

  it('speaks HTTP/1.1 only, so one stalled socket never carries every request', () => {
    const out = addOkHttpClient(MAIN_APPLICATION)
    expect(out).toContain('.protocols(listOf(okhttp3.Protocol.HTTP_1_1))')
    expect(out).not.toContain('pingInterval')
    // RN's default connect timeout is 0 (forever).
    expect(out).toContain('.connectTimeout(10, TimeUnit.SECONDS)')
    // A screen load fires well over OkHttp's default of 5 per host.
    expect(out).toContain('maxRequestsPerHost = 8')
    // One pool for every client the factory builds (RN's networking and
    // expo/fetch each build their own), so evicting it reaches both.
    expect(out).toContain('.connectionPool(okHttpPool)')
  })

  it('drops idle sockets on foreground and on background', () => {
    const out = addOkHttpClient(MAIN_APPLICATION)
    expect(out).toMatch(/override fun onActivityStarted\(activity: android\.app\.Activity\) = evictIdle\(\)/)
    expect(out).toMatch(/override fun onActivityStopped\(activity: android\.app\.Activity\) = evictIdle\(\)/)
    // Off the main thread: evicting closes TLS sockets, and socket I/O on the
    // main thread throws NetworkOnMainThreadException.
    expect(out).toMatch(/okHttpEvictor\.execute \{ okHttpPool\.evictAll\(\) \}/)
  })

  it('is idempotent across prebuilds', () => {
    const once = addOkHttpClient(MAIN_APPLICATION)
    expect(addOkHttpClient(once)).toBe(once)
  })

  it('fails loudly when the template changes shape', () => {
    expect(() => addOkHttpClient('package x\n\nclass MainApplication {}\n')).toThrow(/super\.onCreate/)
  })
})
