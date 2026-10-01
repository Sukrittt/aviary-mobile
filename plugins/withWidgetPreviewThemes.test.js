const fs = require('fs');
const os = require('os');
const path = require('path');

const { applyWidgetPreviewThemes } = require('./withWidgetPreviewThemes');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-previews-'));
  const res = path.join(root, 'res');
  fs.mkdirSync(path.join(res, 'drawable'), { recursive: true });
  fs.writeFileSync(path.join(res, 'drawable', 'envelopemini_preview.png'), 'light');
  fs.writeFileSync(path.join(root, 'night.png'), 'dark');
  return { root, res };
}

describe('applyWidgetPreviewThemes', () => {
  it('moves the light preview to nodpi and adds the dark one under the same name', () => {
    const { root, res } = setup();
    applyWidgetPreviewThemes(res, root, { EnvelopeMini: './night.png' });

    expect(fs.existsSync(path.join(res, 'drawable', 'envelopemini_preview.png'))).toBe(false);
    expect(fs.readFileSync(path.join(res, 'drawable-nodpi', 'envelopemini_preview.png'), 'utf8')).toBe('light');
    expect(fs.readFileSync(path.join(res, 'drawable-night-nodpi', 'envelopemini_preview.png'), 'utf8')).toBe('dark');
  });

  it('fails the build when the widget has no light preview to pair with', () => {
    const { root, res } = setup();
    expect(() => applyWidgetPreviewThemes(res, root, { EnvelopeBar: './night.png' })).toThrow(/previewImage/);
  });
});
