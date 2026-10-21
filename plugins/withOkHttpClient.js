const { withMainApplication } = require('@expo/config-plugins');

const MARKER = 'withOkHttpClient';
const CONNECT_TIMEOUT_SECONDS = 10;
const MAX_REQUESTS_PER_HOST = 8;

/**
 * Android's fetch (OkHttp, via expo/fetch and RN's networking module) speaks
 * HTTP/2 to the API, which multiplexes every request in the app over one TCP
 * socket. On cellular that socket periodically stalls without erroring (a
 * carrier NAT mapping or radio handoff drops it silently). Nothing errors, so
 * every request on it hangs to apiFetch's 15s abort, and an aborted HTTP/2
 * stream only resets the stream: the stalled socket stays in the pool and
 * every new request keeps joining it. PostHog 2026-10-21 (2.14.1): a working
 * connection stalled for 75s, all 43 requests in flight died at 15s, requests
 * started during the stall died too, then every response flushed in the same
 * second. The HTTP/2 ping and idle-connection eviction from 2.13/2.14 never
 * ended one of these: the stalled socket is never idle.
 *
 * So, HTTP/1.1 only: one request per socket. A stalled socket takes down only
 * its own request, and OkHttp closes it when that request is cancelled, so the
 * next request opens a fresh one instead of queueing behind the dead one.
 * Up to MAX_REQUESTS_PER_HOST sockets run in parallel (OkHttp's default is 5;
 * a screen load fires 15-40 requests at once). A connect that hangs fails at
 * CONNECT_TIMEOUT_SECONDS (RN's default is forever) so OkHttp moves to the
 * next address instead of waiting for the abort.
 *
 * Idle sockets are dropped when the app goes to the background and when it
 * comes back, so a resumed app never writes into a socket that died during a
 * doze or a network change. evictAll() only touches idle connections.
 *
 * Same client React Native builds by default (createClientBuilder(context)
 * keeps the 10MB http cache and cookie jar). The factory builds both RN's
 * networking client and expo/fetch's (Expo's global fetch), and they share
 * the pool, so the eviction reaches every request the app makes.
 */
function addOkHttpClient(src) {
  if (src.includes(MARKER)) return src;
  const imports =
    'import com.facebook.react.modules.network.OkHttpClientProvider\n' +
    'import java.util.concurrent.TimeUnit\n';
  const factory =
    `    // ${MARKER}: HTTP/1.1 only, so a stalled cellular socket can't hang every request in the app.\n` +
    '    val okHttpPool = okhttp3.ConnectionPool()\n' +
    '    val okHttpEvictor = java.util.concurrent.Executors.newSingleThreadExecutor()\n' +
    '    val evictIdle = { okHttpEvictor.execute { okHttpPool.evictAll() } }\n' +
    '    OkHttpClientProvider.setOkHttpClientFactory {\n' +
    '      OkHttpClientProvider.createClientBuilder(this)\n' +
    '        .protocols(listOf(okhttp3.Protocol.HTTP_1_1))\n' +
    '        .connectionPool(okHttpPool)\n' +
    `        .connectTimeout(${CONNECT_TIMEOUT_SECONDS}, TimeUnit.SECONDS)\n` +
    `        .dispatcher(okhttp3.Dispatcher().apply { maxRequestsPerHost = ${MAX_REQUESTS_PER_HOST} })\n` +
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
  const out = withImports.replace(/(override fun onCreate\(\) \{\n\s*super\.onCreate\(\)\n)/, `$1${factory}`);
  if (out === withImports) throw new Error(`${MARKER}: couldn't find super.onCreate() in MainApplication`);
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
