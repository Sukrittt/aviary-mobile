// Step 2 of `npm run widget-previews`: draws the trees trees.preview.tsx
// dumped as HTML and screenshots them into assets/widgets/, the images the
// launcher's widget picker shows (wired up in app.json and
// plugins/withWidgetPreviewThemes.js).
//
// It mirrors react-native-android-widget's own layout closely (the library
// draws real Android Views into a bitmap, and this is those Views as flexbox),
// but it's still a mirror. Check a real device before trusting a pixel.
//
// Playwright isn't a dependency of the app. Run with it on hand:
//   npx -p playwright npm run widget-previews
// Pass --sheet to also write every mood in both themes to .out/sheet.png.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const require = createRequire(import.meta.url)

let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  console.error('Playwright not found. Run: npx -p playwright npm run widget-previews')
  process.exit(1)
}

const trees = JSON.parse(fs.readFileSync(path.join(here, '.out', 'trees.json'), 'utf8'))

const FONTS = {
  Fredoka_700Bold: 'assets/fonts/Fredoka_700Bold.ttf',
  Nunito_500Medium: 'assets/fonts/Nunito_500Medium.ttf',
  Nunito_600SemiBold: 'assets/fonts/Nunito_600SemiBold.ttf',
}
const fontFaces = Object.entries(FONTS)
  .map(([name, file]) => {
    const b64 = fs.readFileSync(path.join(root, file)).toString('base64')
    return `@font-face{font-family:${name};src:url(data:font/ttf;base64,${b64})}`
  })
  .join('')

/** '#AARRGGBB' (the library's native form) or '#RRGGBB' to CSS. */
function css(hex) {
  const h = hex.slice(1)
  if (h.length === 6) return `#${h}`
  const a = parseInt(h.slice(0, 2), 16) / 255
  const [r, g, b] = [2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r},${g},${b},${a.toFixed(3)})`
}

const H = { 1: 'center', 3: 'flex-start', 5: 'flex-end' }
const V = { 16: 'center', 48: 'flex-start', 80: 'flex-end' }
function gravity(g = 0, row) {
  const h = H[g & 0x7] ?? 'flex-start'
  const v = V[g & 0x70] ?? 'flex-start'
  return row ? `justify-content:${h};align-items:${v};` : `justify-content:${v};align-items:${h};`
}

const box = (o) => (o ? `${o.top}px ${o.right}px ${o.bottom}px ${o.left}px` : '')

/** Size along each axis, as LinearLayout would resolve it inside `parent`. */
function sizing(p, parent) {
  let s = ''
  const main = parent === 'row' ? 'width' : parent === 'column' ? 'height' : null
  for (const axis of ['width', 'height']) {
    const v = p[axis]
    if (typeof v === 'number') s += `${axis}:${v}px;flex-shrink:0;`
    else if (v === 'match_parent') s += axis === main ? 'flex:1 1 auto;min-width:0;min-height:0;' : parent ? 'align-self:stretch;' : `${axis}:100%;`
  }
  if (p.weight) s += `flex:${p.weight} 1 0;min-width:0;min-height:0;`
  if (parent === 'stack') s += 'grid-area:1/1;' + (p.width === 'match_parent' ? 'width:100%;' : '') + (p.height === 'match_parent' ? 'height:100%;' : '')
  return s
}

function common(p) {
  let s = ''
  if (p.margin) s += `margin:${box(p.margin)};`
  if (p.padding) s += `padding:${box(p.padding)};`
  if (p.backgroundColor) s += `background-color:${css(p.backgroundColor)};`
  if (p.backgroundGradient) {
    const dir = { TOP_BOTTOM: 'to bottom', LEFT_RIGHT: 'to right', BOTTOM_TOP: 'to top', RIGHT_LEFT: 'to left' }[p.backgroundGradient.orientation] ?? 'to bottom'
    s += `background-image:linear-gradient(${dir},${css(p.backgroundGradient.from)},${css(p.backgroundGradient.to)});`
  }
  if (p.borderRadius) { const r = p.borderRadius; s += `border-radius:${r.topLeft}px ${r.topRight}px ${r.bottomRight}px ${r.bottomLeft}px;` }
  if (p.borderWidth) {
    const w = p.borderWidth, c = p.borderColor ?? {}
    for (const side of ['top', 'right', 'bottom', 'left']) if (w[side]) s += `border-${side}:${w[side]}px solid ${css(c[side] ?? '#000000')};`
  }
  if (p.overflow === 'hidden' || p.borderRadius) s += 'overflow:hidden;'
  return s
}

function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

function render(node, parent) {
  const p = node.props ?? {}
  const kids = node.children ?? []
  switch (node.type) {
    case 'LinearLayoutWidget': {
      const row = p.orientation === 'HORIZONTAL'
      const gap = p.separator ? `gap:${p.separator.size}px;` : ''
      const inner = kids.map((k) => render(k, row ? 'row' : 'column')).join('')
      return `<div style="display:flex;box-sizing:border-box;flex-direction:${row ? 'row' : 'column'};${gravity(p.gravity, row)}${gap}${sizing(p, parent)}${common(p)}">${inner}</div>`
    }
    case 'FrameLayoutWidget': {
      const inner = kids.map((k) => render(k, 'stack')).join('')
      return `<div style="display:grid;grid-template:1fr/1fr;box-sizing:border-box;${sizing(p, parent)}${common(p)}">${inner}</div>`
    }
    case 'TextWidget': {
      const one = p.maxLines === 1 ? 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' : ''
      const align = p.textAlign ? `text-align:${p.textAlign};` : ''
      const ls = p.letterSpacing ? `letter-spacing:${p.letterSpacing}px;` : ''
      return `<div style="box-sizing:border-box;min-width:0;font-size:${p.fontSize}px;font-family:${p.fontFamily ?? 'sans-serif'};color:${css(p.color ?? '#ff000000')};${one}${align}${ls}${sizing(p, parent)}${common(p)}">${esc(p.text)}</div>`
    }
    case 'SvgWidget':
      return `<div style="${sizing(p, parent)}${common(p)}">${p.svgString.replace('<svg ', '<svg width="100%" height="100%" ')}</div>`
    default:
      throw new Error(`Unhandled widget node: ${node.type}`)
  }
}

const page = (w, h, body, bg = 'transparent') =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaces}html,body{margin:0;background:${bg}}#cell{width:${w}px;height:${h}px;display:flex;flex-direction:column}</style></head><body>${body}</body></html>`

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const ctx = await browser.newContext({ deviceScaleFactor: 3 })
const tab = await ctx.newPage()

// Picker previews: the on-track state, light in drawable, dark in drawable-night.
const outDir = path.join(root, 'assets', 'widgets')
fs.mkdirSync(outDir, { recursive: true })
for (const t of trees.filter((t) => t.mood === 'ok')) {
  await tab.setViewportSize({ width: t.width, height: t.height })
  await tab.setContent(page(t.width, t.height, `<div id="cell">${render(t.tree, 'column')}</div>`))
  await tab.evaluate(() => document.fonts.ready)
  const file = path.join(outDir, `${t.name}_preview${t.scheme === 'dark' ? '_night' : ''}.png`)
  await tab.locator('#cell').screenshot({ path: file, omitBackground: true })
  console.log('wrote', path.relative(root, file))
}

if (process.argv.includes('--sheet')) {
  const moods = ['ok', 'tight', 'over', 'stale']
  const cells = []
  for (const scheme of ['light', 'dark']) {
    for (const name of ['envelopemini', 'envelopebar', 'envelope']) {
      for (const mood of moods) {
        const t = trees.find((x) => x.name === name && x.scheme === scheme && x.mood === mood)
        cells.push(`<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start"><div style="font:12px sans-serif;color:#bbb">${name} · ${scheme} · ${mood}</div><div style="width:${t.width}px;height:${t.height}px;display:flex;flex-direction:column">${render(t.tree, 'column')}</div></div>`)
      }
    }
  }
  const body = `<div id="cell" style="width:1400px;height:auto;padding:24px;display:flex;flex-direction:row;flex-wrap:wrap;gap:24px;align-items:flex-start;background:#050505">${cells.join('')}</div>`
  await tab.setViewportSize({ width: 1450, height: 1200 })
  await tab.setContent(page(1400, 0, body, '#050505'))
  await tab.evaluate(() => document.fonts.ready)
  const file = path.join(here, '.out', 'sheet.png')
  await tab.locator('#cell').screenshot({ path: file })
  console.log('wrote', path.relative(root, file))
}

await browser.close()
