import { act, fireEvent, render } from '@testing-library/react-native'
import { ScrollView, View } from 'react-native'
import { moveItem } from '@/src/lib/dragReorder'
import { GestureDetector } from 'react-native-gesture-handler'
import EnvelopesScreen, { groupDeleteNote } from './envelopes'

const initialGroups = ['House', 'Lifestyle', 'Savings', 'Personal', 'Food']
let mockGroups = [...initialGroups]
const mockCategories = mockGroups.flatMap((group, i) =>
  Array.from({ length: i % 3 + 1 }, (_, n) => ({ name: `${group} category ${n}`, group })),
)
const mockMove = jest.fn()
const mockAnimations: ((finished: boolean) => void)[] = []
const mockFrameCallbacks = new Set<() => void>()
const mockSprings: unknown[] = []
jest.mock('@/src/hooks/useGroups', () => ({
  useGroups: () => ({ data: mockGroups }),
  useMoveGroup: () => ({ mutate: mockMove }),
  useAddGroup: () => ({}), useUpdateGroup: () => ({}), useDeleteGroup: () => ({}),
}))
jest.mock('@/src/hooks/useCategories', () => ({
  useCategories: () => ({ data: mockCategories }),
  useMoveCategory: () => ({}), useAddCategory: () => ({}),
  useUpdateCategory: () => ({}), useDeleteCategory: () => ({}),
}))
jest.mock('@/src/hooks/useCollapsedGroups', () => ({
  useCollapsedGroups: () => jest.requireActual('react').useState(new Set(['Savings'])),
}))
jest.mock('@/src/theme/ThemeProvider', () => ({ useTheme: () => ({ tokens: jest.requireActual('@/src/theme/tokens').darkTokens, ...jest.requireActual('@/src/theme/scale') }) }))
jest.mock('@/src/hooks/useRefresh', () => ({ useRefresh: () => ({ refreshing: false, onRefresh: jest.fn() }) }))
jest.mock('@/src/lib/netStatus', () => ({ useOnline: () => true }))
jest.mock('@/src/components/nav/AnimatedTabContent', () => ({ AnimatedTabContent: ({ children }: any) => children }))
jest.mock('@/src/components/ui/Screen', () => ({ Screen: ({ children }: any) => children, useNavPadding: () => 0 }))
jest.mock('@/src/components/shared/Modal', () => ({ BottomSheet: () => null }))
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: any) => children,
  Gesture: { Pan: () => {
    const gesture: any = { config: {} }
    for (const key of ['enabled', 'onStart', 'onUpdate', 'onFinalize', 'activateAfterLongPress', 'minDistance']) {
      gesture[key] = (value: unknown) => { gesture.config[key] = value; return gesture }
    }
    return gesture
  } },
}))
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: Function, ...args: unknown[]) => fn(...args) }))
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  measure: () => ({ pageY: 0, height: 64 }),
  useSharedValue: (initial: unknown) => {
    const React = jest.requireActual('react')
    const initialRef = React.useRef(initial)
    return React.useMemo(() => {
      let current: any = initialRef.current
      return {
        get value() { return current?.animated ? current.to : current },
        set value(next: any) {
          if (current?.animated) current.finish(false)
          current = next
        },
      }
    }, [])
  },
  withSpring: (value: unknown) => {
    mockSprings.push(value)
    return value
  },
  withTiming: (value: number, _config: unknown, callback?: (finished: boolean) => void) => {
    if (!callback) return value
    let done = false
    const finish = (finished: boolean) => {
      if (done) return
      done = true
      callback(finished)
    }
    mockAnimations.push(finish)
    return { animated: true, to: value, finish }
  },
  useFrameCallback: (callback: () => void) => {
    const React = jest.requireActual('react')
    const latest = React.useRef(callback)
    latest.current = callback
    const frame = React.useCallback(() => latest.current(), [])
    React.useEffect(() => () => { mockFrameCallbacks.delete(frame) }, [frame])
    return React.useMemo(() => ({ setActive: (active: boolean) => {
      if (active) mockFrameCallbacks.add(frame)
      else mockFrameCallbacks.delete(frame)
    } }), [frame])
  },
}))

let frames: Map<number, FrameRequestCallback>
let nextFrame: number
beforeEach(() => {
  mockGroups = [...initialGroups]
  mockMove.mockReset()
  mockMove.mockImplementation(({ name, toIndex }) => { mockGroups = moveItem(mockGroups, name, toIndex) })
  mockAnimations.length = 0
  mockSprings.length = 0
  mockFrameCallbacks.clear()
  frames = new Map()
  nextFrame = 0
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => { if (id != null) frames.delete(id) })
})
afterEach(() => jest.restoreAllMocks())

function frame() {
  act(() => {
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((callback) => callback(0))
  })
}

function mount() {
  const screen = render(<EnvelopesScreen />)
  // Exercise the screen's actual drop/restore lifecycle at the UI-thread callback boundary.
  const cards = () => screen.UNSAFE_root.findAll((node) =>
    typeof node.type === 'function' && node.type.name === 'DraggableGroupCard',
  )
  function drop(name: string, to: number) {
    const card = cards().find((node) => node.props.name === name)!
    const drag = card.props.drag
    act(() => {
      drag.active.value = true
      drag.name.value = name
      card.props.onLift(name)
    })
    act(() => card.props.onDrop(name, cards().indexOf(card), to))
  }
  // A body is open when its group is not collapsed; bodies stay mounted and animate their
  // height, so their text is in the tree either way.
  const bodyOpen = (name: string) => {
    const card = cards().find((node) => node.props.name === name)!
    return !card.findAll((node) => typeof node.type === 'function' && node.type.name === 'GroupBody')[0]
      .props.collapsed
  }
  return { ...screen, cards, drop, bodyOpen }
}

it('restores expanded bodies after every drop, including immediate successive reorders', () => {
  const screen = mount()
  for (let i = 0; i < 10; i++) {
    screen.drop('House', i % 2 === 0 ? 4 : 0)
    expect(screen.bodyOpen('House')).toBe(false)
    for (let f = 0; f < 4; f++) frame()
    expect(screen.bodyOpen('House')).toBe(true)
    expect(screen.bodyOpen('Lifestyle')).toBe(true)
    expect(screen.bodyOpen('Savings')).toBe(false)
    expect(screen.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(true)
    expect(screen.cards().every((card) => !card.props.drag.active.value)).toBe(true)
    expect(screen.cards().map((card) => card.props.name)).toEqual(mockGroups)
  }
})

it('does not give card position ownership to native layout animations', () => {
  const screen = mount()
  // Native layout animations own a view's origin and size until they finish, and they outlive
  // their React props. A card whose position one of them wrote lands wherever that animation
  // last aimed, overlapping newly expanded neighbours. Open/close animates body height instead.
  for (const card of screen.cards()) {
    expect(card.findAllByType(View).filter((node) => node.props.layout)).toHaveLength(0)
  }
  fireEvent.press(screen.getByText('Collapse all'))
  screen.drop('Lifestyle', 4)
  for (let f = 0; f < 4; f++) frame()
  for (const card of screen.cards()) {
    expect(card.findAllByType(View).filter((node) => node.props.layout)).toHaveLength(0)
  }
})

// GroupChevron springs a rotation string on every render; only the card offsets are numbers.
function slides() {
  return mockSprings.filter((value) => typeof value === 'number')
}

it('slides a card from where layout moved it, but never while a drag holds the lock', () => {
  const screen = mount()
  const moveTo = (index: number, y: number) =>
    act(() => {
      fireEvent(screen.cards()[index].findAllByType(View)[0], 'layout', { nativeEvent: { layout: { y } } })
    })
  // The first layout of a card only records where it landed: there is nowhere to slide from.
  moveTo(1, 70)
  expect(slides()).toEqual([])
  // A group above it opened, so it slides the distance it travelled back to zero.
  mockSprings.length = 0
  moveTo(1, 260)
  expect(slides()).toEqual([0])
  // Drag commits must land instantly. Every phase of a drop re-lays out the whole list.
  mockSprings.length = 0
  screen.drop('House', 4)
  moveTo(1, 70)
  for (let f = 0; f < 4; f++) frame()
  expect(slides()).toEqual([])
})

it('fades a body in on tap and leaves it out of native layout while collapsed', () => {
  const screen = mount()
  expect(screen.bodyOpen('Savings')).toBe(false)
  expect(screen.queryByText('Savings category 0')).toBeNull()
  fireEvent.press(screen.getByText('Savings'))
  expect(screen.bodyOpen('Savings')).toBe(true)
  expect(screen.getByText('Savings category 0')).toBeTruthy()
})

function gestureFor(card: ReturnType<ReturnType<typeof mount>['cards']>[number], longPress = false) {
  return card.findAllByType(GestureDetector).find((node) =>
    longPress ? node.props.gesture.config.activateAfterLongPress : node.props.gesture.config.minDistance === 0,
  )!.props.gesture.config
}

it('ignores a canceled drop animation instead of committing a stale reorder', () => {
  const screen = mount()
  const card = screen.cards()[0]
  const gesture = gestureFor(card)
  act(() => gesture.onStart({ absoluteY: 20, translationY: 0 }))
  act(() => gesture.onUpdate({ absoluteY: 180, translationY: 160 }))
  act(() => gesture.onFinalize({}, true))
  expect(mockAnimations).toHaveLength(1)
  act(() => mockAnimations.shift()!(false))
  expect(mockMove).not.toHaveBeenCalled()
})

it('cancels an interrupted gesture without saving its hover position', () => {
  const screen = mount()
  const gesture = gestureFor(screen.cards()[0])
  act(() => gesture.onStart({ absoluteY: 20, translationY: 0 }))
  act(() => gesture.onUpdate({ absoluteY: 180, translationY: 160 }))
  act(() => gesture.onFinalize({}, false))
  act(() => mockAnimations.splice(0).forEach((callback) => callback(true)))
  for (let f = 0; f < 4; f++) frame()
  expect(mockMove).not.toHaveBeenCalled()
  expect(screen.cards().map((card) => card.props.name)).toEqual(mockGroups)
  expect(screen.getByText('House category 0')).toBeTruthy()
})

it('can release a long press before its first frame without canceling the drop', () => {
  const screen = mount()
  const gesture = gestureFor(screen.cards()[0], true)
  act(() => gesture.onStart({ absoluteY: 20, translationY: 0 }))
  act(() => gesture.onFinalize({}, true))
  act(() => mockFrameCallbacks.forEach((callback) => callback()))
  act(() => mockAnimations.splice(0).forEach((callback) => callback(true)))
  for (let f = 0; f < 4; f++) frame()
  expect(screen.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(true)
  expect(screen.getByText('House category 0')).toBeTruthy()
  expect(mockMove).not.toHaveBeenCalled()
})

it('keeps the current order stable when a query update arrives mid-drag', () => {
  const screen = mount()
  const gesture = gestureFor(screen.cards()[0])
  act(() => gesture.onStart({ absoluteY: 20, translationY: 0 }))
  act(() => gesture.onUpdate({ absoluteY: 180, translationY: 160 }))
  mockGroups = [...initialGroups].reverse()
  screen.rerender(<EnvelopesScreen />)
  expect(screen.cards().map((card) => card.props.name)).toEqual(initialGroups)
})

it('ignores a second finger during drop and accepts another drag after restoration', () => {
  const screen = mount()
  for (let i = 0; i < 20; i++) {
    const card = screen.cards()[0]
    const name = card.props.name
    const gesture = gestureFor(card)
    act(() => gesture.onStart({ absoluteY: 20, translationY: 0 }))
    act(() => gesture.onUpdate({ absoluteY: 180, translationY: 160 }))
    act(() => mockFrameCallbacks.forEach((callback) => callback()))
    act(() => gesture.onFinalize({}, true))
    const rejected = gestureFor(screen.cards()[1])
    act(() => rejected.onStart({ absoluteY: 20, translationY: 0 }))
    act(() => rejected.onUpdate({ absoluteY: 100, translationY: 80 }))
    act(() => rejected.onFinalize({}, true))
    expect(mockAnimations).toHaveLength(1)
    act(() => mockAnimations.splice(0).forEach((callback) => callback(true)))
    for (let f = 0; f < 4; f++) frame()
    expect(mockMove).toHaveBeenCalledTimes(i + 1)
    expect(mockMove).toHaveBeenLastCalledWith({ name, toIndex: 2 }, expect.any(Object))
    expect(screen.cards().map((card) => card.props.name)).toEqual(mockGroups)
    expect(screen.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(true)
    expect(screen.getByText('House category 0')).toBeTruthy()
  }
})

it('keeps the owning gesture when the other recognizer starts on the same card', () => {
  const screen = mount()
  const card = screen.cards()[0]
  const grip = gestureFor(card)
  const longPress = gestureFor(card, true)
  act(() => grip.onStart({ absoluteY: 20, translationY: 0 }))
  act(() => grip.onUpdate({ absoluteY: 180, translationY: 160 }))
  act(() => longPress.onStart({ absoluteY: 180, translationY: 0 }))
  act(() => longPress.onFinalize({}, false))
  act(() => grip.onFinalize({}, true))
  expect(mockAnimations).toHaveLength(1)
  act(() => mockAnimations.splice(0).forEach((callback) => callback(true)))
  for (let f = 0; f < 4; f++) frame()
  expect(mockMove).toHaveBeenCalledTimes(1)
  expect(screen.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(true)
})

it('warns that a group delete sends its categories to Archive', () => {
  expect(groupDeleteNote(0)).toBe('You can restore it from Archive for 7 days.')
  expect(groupDeleteNote(1)).toBe('Its 1 category goes to Archive too. You can restore them for 7 days.')
  expect(groupDeleteNote(3)).toBe('Its 3 categories go to Archive too. You can restore them for 7 days.')
})
