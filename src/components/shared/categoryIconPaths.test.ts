import { CATEGORY_ICONS } from '@/src/lib/categoryIcons'
import { CATEGORY_ICON_PATHS } from './categoryIconPaths'

it('has a path for every catalog icon (run npm run gen:category-icons)', () => {
  expect(Object.keys(CATEGORY_ICONS).filter((key) => !(key in CATEGORY_ICON_PATHS))).toEqual([])
})
