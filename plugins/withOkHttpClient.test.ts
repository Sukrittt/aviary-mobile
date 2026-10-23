// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addOkHttpClient } = require('./withOkHttpClient')

// The shape of Expo's MainApplication template: the lifecycle dispatcher runs
// every package's ApplicationLifecycleListener, expo-app-metrics' included.
const MAIN_APPLICATION = `package com.example.app

import android.app.Application

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }
}
`

describe('addOkHttpClient', () => {
  it('installs the client factory after the lifecycle listeners, so no package can replace it', () => {
    const out = addOkHttpClient(MAIN_APPLICATION)
    expect(out).toContain('import com.facebook.react.modules.network.OkHttpClientProvider')
    expect(out).toContain('import java.util.concurrent.TimeUnit')
    expect(out).toContain('OkHttpClientProvider.setOkHttpClientFactory {')
    // expo-app-metrics sets its own factory from onApplicationCreate, and the
    // last one set wins. Before, this ran first and never took effect.
    expect(out.indexOf('setOkHttpClientFactory')).toBeGreaterThan(out.indexOf('ApplicationLifecycleDispatcher.onApplicationCreate(this)'))
  })

  it('keeps expo-observe watching every request', () => {
    const out = addOkHttpClient(MAIN_APPLICATION)
    expect(out).toContain('.addInterceptor(expo.modules.appmetrics.networkrequests.NetworkRequestInterceptor.instance)')
    expect(out).toContain('.eventListenerFactory(expo.modules.appmetrics.networkrequests.NetworkRequestEventListener.factory)')
  })

  it('pings HTTP/2 connections, so a dead one fails fast and its requests retry', () => {
    const out = addOkHttpClient(MAIN_APPLICATION)
    expect(out).toContain('.pingInterval(5, TimeUnit.SECONDS)')
    expect(out).not.toContain('.protocols(')
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
    expect(() => addOkHttpClient('package x\n\nclass MainApplication {}\n')).toThrow(/onApplicationCreate/)
  })
})
