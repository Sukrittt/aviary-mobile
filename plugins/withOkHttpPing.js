const { withMainApplication } = require('@expo/config-plugins');

const PING_SECONDS = 5;
const MARKER = 'withOkHttpPing';

/**
 * fetch() on Android multiplexes every request to the API over one pooled
 * HTTP/2 connection. After a network switch or a stretch in the background
 * that connection can die without either side closing it, and OkHttp keeps
 * handing it out: every request then hangs until apiFetch's 15s timeout,
 * all at once, and only an app restart (a fresh pool) cleared it (PostHog,
 * 2026-10-18: a full minute of 15s timeouts, then 130-800ms answers right
 * after a relaunch).
 *
 * The 10s ping alone (2.13.0) didn't stop it: OkHttp only fails a connection
 * when a ping is still unanswered at the next one, 10-20s, so apiFetch's 15s
 * timeout always lost the race (PostHog 2026-10-21: 70 more 15s bursts on
 * 2.13/2.14, each cleared only by a relaunch). So, on top of a 5s ping (a dead
 * connection fails within 5-10s, under the timeout):
 * - idle connections are dropped when the app goes to the background and
 *   again when it comes back, so a resumed app never reuses a socket that sat
 *   through a doze or a network change;
 * - any failed call (a timeout's cancel included) drops whatever went idle,
 *   so the request after a stuck burst opens a fresh connection instead of
 *   queueing behind the dead one.
 * evictAll() only touches idle connections; a request in flight is never cut.
 *
 * Same client React Native builds by default (createClientBuilder(context)
 * keeps the 10MB http cache and cookie jar), plus the ping. The factory builds
 * both RN's networking client and expo/fetch's (Expo's global fetch), so the
 * shared pool covers every request the app makes.
 */
function addOkHttpPing(src) {
  if (src.includes(MARKER)) return src;
  const imports =
    'import com.facebook.react.modules.network.OkHttpClientProvider\n' +
    'import java.util.concurrent.TimeUnit\n';
  const factory =
    `    // ${MARKER}: fail a silently dead HTTP/2 connection instead of hanging on it.\n` +
    '    val okHttpPool = okhttp3.ConnectionPool()\n' +
    '    val okHttpEvictor = java.util.concurrent.Executors.newSingleThreadExecutor()\n' +
    '    val evictIdle = { okHttpEvictor.execute { okHttpPool.evictAll() } }\n' +
    '    OkHttpClientProvider.setOkHttpClientFactory {\n' +
    '      OkHttpClientProvider.createClientBuilder(this)\n' +
    '        .connectionPool(okHttpPool)\n' +
    `        .pingInterval(${PING_SECONDS}, TimeUnit.SECONDS)\n` +
    '        .eventListener(object : okhttp3.EventListener() {\n' +
    '          override fun callFailed(call: okhttp3.Call, ioe: java.io.IOException) = evictIdle()\n' +
    '        })\n' +
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

module.exports = function withOkHttpPing(config) {
  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') throw new Error(`${MARKER}: expected a Kotlin MainApplication`);
    cfg.modResults.contents = addOkHttpPing(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.addOkHttpPing = addOkHttpPing;
