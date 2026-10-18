const { withMainApplication } = require('@expo/config-plugins');

const PING_SECONDS = 10;
const MARKER = 'withOkHttpPing';

/**
 * fetch() on Android multiplexes every request to the API over one pooled
 * HTTP/2 connection. After a network switch or a stretch in the background
 * that connection can die without either side closing it, and OkHttp keeps
 * handing it out: every request then hangs until apiFetch's 15s timeout,
 * all at once, and only an app restart (a fresh pool) cleared it (PostHog,
 * 2026-10-18: a full minute of 15s timeouts, then 130-800ms answers right
 * after a relaunch). An HTTP/2 ping makes OkHttp notice a dead connection
 * within ~PING_SECONDS and fail it, so the retry opens a new one.
 *
 * Same client React Native builds by default (createClientBuilder(context)
 * keeps the 10MB http cache and cookie jar), plus the ping.
 */
function addOkHttpPing(src) {
  if (src.includes(MARKER)) return src;
  const imports =
    'import com.facebook.react.modules.network.OkHttpClientProvider\n' +
    'import java.util.concurrent.TimeUnit\n';
  const factory =
    `    // ${MARKER}: fail a silently dead HTTP/2 connection instead of hanging on it.\n` +
    '    OkHttpClientProvider.setOkHttpClientFactory {\n' +
    `      OkHttpClientProvider.createClientBuilder(this).pingInterval(${PING_SECONDS}, TimeUnit.SECONDS).build()\n` +
    '    }\n';
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
