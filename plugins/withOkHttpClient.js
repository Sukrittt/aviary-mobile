const { withMainApplication } = require('@expo/config-plugins');

const MARKER = 'withOkHttpClient';
const AFTER_LISTENERS = 'after the lifecycle listeners';
const CONNECT_TIMEOUT_SECONDS = 5;
const MAX_REQUESTS_PER_HOST = 8;
const PING_INTERVAL_SECONDS = 5;

/**
 * The OkHttp client every request in the app goes through: RN's networking
 * module and expo/fetch (Expo's global fetch) both build theirs from this
 * factory.
 *
 * Installed after ApplicationLifecycleDispatcher.onApplicationCreate, because
 * expo-observe's expo-app-metrics sets its own factory there to watch network
 * requests, and the last factory set wins. From expo-observe's arrival
 * (2026-09-21) until this moved, that factory replaced this one in every
 * build, so none of the settings below ever ran (logged on the emulator:
 * protocols=[h2, http/1.1] maxPerHost=5 connectMs=0 pingMs=0). Its interceptor
 * and event listener are added here instead, as its docs say to for an
 * app-owned client, so expo-observe still sees every request.
 *
 * What was killing requests: a pooled HTTP/2 connection goes silently dead
 * while idle (a NAT mapping expires, a cellular handoff), with no FIN or RST.
 * The next screen's requests are written to it and nothing comes back. With no
 * ping and no read timeout OkHttp can't tell, so they hang until apiFetch's
 * 15s abort. Traced on the emulator: five requests on a connection idle for
 * 60s, no response for 14.4s, then OkHttp retried all five on a new
 * connection and they answered in ~120ms, after the abort had fired.
 *
 * So, a ping every PING_INTERVAL_SECONDS. A connection that misses a pong is
 * failed within two intervals and OkHttp retries its requests on a fresh one,
 * well inside the 15s abort. The pings also keep the NAT mapping alive, so the
 * connection survives idle gaps instead of being replaced. (Closing idle
 * connections after 30s instead tripled the new connections and their
 * handshakes in testing, each one more exposed to a slow connect.)
 *
 * A connect that hangs fails at CONNECT_TIMEOUT_SECONDS (RN's default is
 * forever) and OkHttp tries the host's next IP. 330 of 331 connects in testing
 * took under 3s (p99 1.3s); at 10s, one Vercel edge IP that didn't answer used
 * up most of the 15s abort before the next IP got a turn.
 * OkHttp caps requests per host even on HTTP/2, and a screen load fires 15-40
 * at once.
 *
 * Idle connections are dropped when the app goes to the background and when it
 * comes back, so pings only run while the app is on screen, and a resumed app
 * never starts on one that died during a doze. evictAll() only touches idle
 * connections. Same base client React Native
 * builds by default (createClientBuilder(context) keeps the 10MB http cache and
 * cookie jar), one pool shared by every client the factory builds.
 */
function addOkHttpClient(src) {
  if (src.includes(AFTER_LISTENERS)) return src;
  // An android/ prebuilt by an older version of this plugin has its factory
  // before the lifecycle listeners, where it gets replaced. Don't build that.
  if (src.includes(MARKER)) throw new Error(`${MARKER}: MainApplication has an old OkHttp factory. Run npx expo prebuild --clean`);
  const imports =
    'import com.facebook.react.modules.network.OkHttpClientProvider\n' +
    'import java.util.concurrent.TimeUnit\n';
  const factory =
    `    // ${MARKER}: ${AFTER_LISTENERS}, so expo-app-metrics' factory can't replace this one.\n` +
    '    val okHttpPool = okhttp3.ConnectionPool()\n' +
    '    val okHttpEvictor = java.util.concurrent.Executors.newSingleThreadExecutor()\n' +
    '    val evictIdle = { okHttpEvictor.execute { okHttpPool.evictAll() } }\n' +
    '    OkHttpClientProvider.setOkHttpClientFactory {\n' +
    '      OkHttpClientProvider.createClientBuilder(this)\n' +
    '        .connectionPool(okHttpPool)\n' +
    `        .pingInterval(${PING_INTERVAL_SECONDS}, TimeUnit.SECONDS)\n` +
    `        .connectTimeout(${CONNECT_TIMEOUT_SECONDS}, TimeUnit.SECONDS)\n` +
    `        .dispatcher(okhttp3.Dispatcher().apply { maxRequestsPerHost = ${MAX_REQUESTS_PER_HOST} })\n` +
    '        .addInterceptor(expo.modules.appmetrics.networkrequests.NetworkRequestInterceptor.instance)\n' +
    '        .eventListenerFactory(expo.modules.appmetrics.networkrequests.NetworkRequestEventListener.factory)\n' +
    '        .build()\n' +
    '    }\n' +
    '    registerActivityLifecycleCallbacks(object : android.app.Application.ActivityLifecycleCallbacks {\n' +
    '      override fun onActivityStarted(activity: android.app.Activity) = evictIdle()\n' +
    '      override fun onActivityStopped(activity: android.app.Activity) = evictIdle()\n' +
    '      override fun onActivityCreated(activity: android.app.Activity, savedInstanceState: android.os.Bundle?) {}\n' +
    '      override fun onActivityResumed(activity: android.app.Activity) {}\n' +
    '      override fun onActivityPaused(activity: android.app.Activity) {}\n' +
    '      override fun onActivitySaveInstanceState(activity: android.app.Activity, outState: android.os.Bundle) {}\n' +
    '      override fun onActivityDestroyed(activity: android.app.Activity) {}\n' +
    '    })\n';
  const withImports = src.replace(/^(package .+\n)/m, `$1\n${imports}`);
  const out = withImports.replace(/(\n\s*ApplicationLifecycleDispatcher\.onApplicationCreate\(this\)\n)/, `$1${factory}`);
  if (out === withImports) throw new Error(`${MARKER}: couldn't find ApplicationLifecycleDispatcher.onApplicationCreate(this) in MainApplication`);
  return out;
}

module.exports = function withOkHttpClient(config) {
  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') throw new Error(`${MARKER}: expected a Kotlin MainApplication`);
    cfg.modResults.contents = addOkHttpClient(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.addOkHttpClient = addOkHttpClient;
