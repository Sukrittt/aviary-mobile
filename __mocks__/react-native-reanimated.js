// Manual Jest mock for react-native-reanimated. The real package (v4) drives
// worklets through the react-native-worklets native module, which isn't
// present under Jest and crashes at import time — including reanimated's own
// shipped `react-native-reanimated/mock`, which still pulls in the real
// engine for its frame-advance test helpers. This mock runs every "worklet"
// synchronously on the JS thread instead: animated components render as
// their plain RN element, shared values are plain refs, and style/animation
// hooks just compute their result once per render. Auto-picked up by Jest
// for every test (no explicit jest.mock needed) since it lives in
// `__mocks__` adjacent to `node_modules`.
const React = require('react')
const RN = require('react-native')

function useSharedValue(initial) {
  const ref = React.useRef({ value: initial })
  return ref.current
}

function useAnimatedStyle(fn) {
  return fn()
}

function useAnimatedProps(fn) {
  return fn()
}

function useDerivedValue(fn) {
  return { value: fn() }
}

function useAnimatedRef() {
  return React.useRef(null)
}

function useAnimatedScrollHandler() {
  return () => {}
}

const identity = (toValue) => toValue

const Easing = {
  linear: identity,
  ease: identity,
  quad: identity,
  cubic: identity,
  back: () => identity,
  bezier: () => identity,
  in: (fn) => fn,
  out: (fn) => fn,
  inOut: (fn) => fn,
}

function createAnimatedComponent(Component) {
  return Component
}

// Layout animations are passed as `entering`/`exiting` props, so they only need
// to be chainable objects that RN will ignore on a plain View. Nothing renders
// them, but a component that builds `FadeIn.delay(80).duration(350)` at module
// or render time would otherwise throw on `undefined`.
function layoutAnimation() {
  const builder = {}
  for (const method of ['delay', 'duration', 'easing', 'springify', 'damping', 'stiffness', 'withInitialValues', 'build']) {
    builder[method] = () => builder
  }
  return builder
}

const FadeIn = layoutAnimation()
const FadeInDown = layoutAnimation()
const FadeInUp = layoutAnimation()
const FadeOut = layoutAnimation()
const FadeOutLeft = layoutAnimation()
const LinearTransition = layoutAnimation()
const SlideInUp = layoutAnimation()
const SlideInDown = layoutAnimation()
const SlideOutUp = layoutAnimation()
const ZoomIn = layoutAnimation()

const Animated = {
  View: RN.View,
  ScrollView: RN.ScrollView,
  Text: RN.Text,
  Image: RN.Image,
  FlatList: RN.FlatList,
  createAnimatedComponent,
}

module.exports = {
  __esModule: true,
  default: Animated,
  View: RN.View,
  ScrollView: RN.ScrollView,
  Text: RN.Text,
  Image: RN.Image,
  FlatList: RN.FlatList,
  createAnimatedComponent,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useDerivedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useReducedMotion: () => false,
  withSpring: identity,
  withTiming: identity,
  withDelay: (_delay, toValue) => toValue,
  withSequence: (...values) => values[values.length - 1],
  withRepeat: (value) => value,
  cancelAnimation: () => {},
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  interpolate: (value) => value,
  interpolateColor: (_value, _input, outputRange) => outputRange[0],
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutLeft,
  LinearTransition,
  SlideInUp,
  SlideInDown,
  SlideOutUp,
  ZoomIn,
}
