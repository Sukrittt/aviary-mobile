const fs = require('fs');
const path = require('path');

const { withFinalizedMod } = require('@expo/config-plugins');

/**
 * react-native-android-widget copies each widget's `previewImage` into
 * res/drawable, and that's the only preview the launcher's widget picker can
 * show: a light card, even on a dark-mode phone. This moves that image into
 * res/drawable-nodpi and puts a dark twin in res/drawable-night-nodpi under
 * the same name, so Android picks by the system theme like the widget does.
 *
 * nodpi because the images are rendered at 3x on purpose (see
 * scripts/widget-previews): plain drawable/ counts as mdpi, and an xxhdpi
 * device would scale a 900px preview up threefold in memory before the
 * picker scales it back down.
 *
 * Options: { widgets: { [widgetName]: './path/to/night.png' } }. Runs as a
 * finalized mod so the library's own copy has already happened.
 */
function applyWidgetPreviewThemes(resDir, projectRoot, widgets) {
  for (const [name, nightSrc] of Object.entries(widgets)) {
    const file = `${name.toLowerCase()}_preview.png`;
    const lightFrom = path.join(resDir, 'drawable', file);
    if (!fs.existsSync(lightFrom)) {
      throw new Error(
        `No ${file} in res/drawable. Set previewImage for the ${name} widget in app.json.`
      );
    }
    const nodpi = path.join(resDir, 'drawable-nodpi');
    const nightNodpi = path.join(resDir, 'drawable-night-nodpi');
    fs.mkdirSync(nodpi, { recursive: true });
    fs.mkdirSync(nightNodpi, { recursive: true });
    fs.renameSync(lightFrom, path.join(nodpi, file));
    fs.copyFileSync(path.resolve(projectRoot, nightSrc), path.join(nightNodpi, file));
  }
}

module.exports = function withWidgetPreviewThemes(config, options = {}) {
  return withFinalizedMod(config, [
    'android',
    async (finalizedConfig) => {
      const { platformProjectRoot, projectRoot } = finalizedConfig.modRequest;
      applyWidgetPreviewThemes(
        path.join(platformProjectRoot, 'app', 'src', 'main', 'res'),
        projectRoot,
        options.widgets ?? {}
      );
      return finalizedConfig;
    },
  ]);
};
module.exports.applyWidgetPreviewThemes = applyWidgetPreviewThemes;
