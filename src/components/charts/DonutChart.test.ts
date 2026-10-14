import {
  buildDonutTransition,
  layoutDonutSegments,
  type DonutSegment,
} from './DonutChart'

function segment(key: string, value: number): DonutSegment {
  return { key, label: key, value, color: key }
}

describe('donut layout transitions', () => {
  it('lays segments out as proportional contiguous arcs', () => {
    const arcs = layoutDonutSegments([segment('a', 75), segment('b', 25)])

    expect(arcs[0]).toMatchObject({ key: 'a', startDeg: 0, endDeg: 270 })
    expect(arcs[1]).toMatchObject({ key: 'b', startDeg: 270, endDeg: 360 })
  })

  it('shrinks removed wedges and expands survivors to their new angles', () => {
    const before = layoutDonutSegments([segment('investment', 80), segment('food', 20)])
    const after = layoutDonutSegments([segment('food', 20)])
    const transition = buildDonutTransition(before, after)

    expect(transition.find((arc) => arc.key === 'investment')).toMatchObject({
      fromStartDeg: 0,
      fromEndDeg: 288,
      toStartDeg: 0,
      toEndDeg: 0,
      toOpacity: 0,
      exiting: true,
    })
    expect(transition.find((arc) => arc.key === 'food')).toMatchObject({
      fromStartDeg: 288,
      fromEndDeg: 360,
      toStartDeg: 0,
      toEndDeg: 360,
      exiting: false,
    })
  })

  it('grows an entering Other bucket from zero width', () => {
    const before = layoutDonutSegments([segment('large', 100)])
    const after = layoutDonutSegments([segment('large', 97), segment('__other__', 3)])
    const other = buildDonutTransition(before, after).find((arc) => arc.key === '__other__')

    expect(other).toMatchObject({
      fromStartDeg: 349.2,
      fromEndDeg: 349.2,
      toStartDeg: 349.2,
      toEndDeg: 360,
      fromOpacity: 0,
      toOpacity: 1,
    })
  })

  it('ignores non-positive segments and returns an empty layout for no spend', () => {
    expect(layoutDonutSegments([segment('zero', 0), segment('negative', -2)])).toEqual([])
  })
})
