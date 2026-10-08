import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, RefreshControl, StyleSheet, Animated, PanResponder } from 'react-native'
import type { LayoutChangeEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronRight, MoreVertical, Plus, Equal } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Reanimated, {
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { AnimatedTabContent } from '@/src/components/nav/AnimatedTabContent'
import { Screen, useNavPadding } from '@/src/components/ui/Screen'
import { Chip } from '@/src/components/ui/Chip'
import { IconButton } from '@/src/components/ui/Button'
import { useTheme } from '@/src/theme/ThemeProvider'
import type { ThemeTokens } from '@/src/theme/tokens'
import { fontFamily } from '@/src/theme/fonts'
import {
  useCategories,
  useAddCategory,
  useUpdateCategory,
  useDeleteCategory,
  useMoveCategory,
} from '@/src/hooks/useCategories'
import { useGroups, useAddGroup, useUpdateGroup, useDeleteGroup, useMoveGroup } from '@/src/hooks/useGroups'
import { groupEmoji, categoryEmoji, splitEmoji } from '@/src/lib/emoji'
import { LoadingCaption } from '@/src/components/shared/LoadingCaption'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { BottomSheet } from '@/src/components/shared/Modal'
import { Icon } from '@/src/components/shared/Icon'
import { useRefresh } from '@/src/hooks/useRefresh'
import { useCollapsedGroups } from '@/src/hooks/useCollapsedGroups'
import { DEFAULT_ALERT_PCTS, ALERT_PRESET_PCTS, MAX_ALERT_PCTS } from '@/src/lib/alerts'
import type { CategoryRow } from '@/src/types'
import { EMPTY } from '@/src/lib/constants'
import { OfflineScreen } from '@/src/components/shared/OfflineScreen'
import { ErrorScreen } from '@/src/components/shared/ErrorScreen'
import { useOnline } from '@/src/lib/netStatus'
import { dragShift, dragTarget, moveItem } from '@/src/lib/dragReorder'
import { EmptyState } from '@/src/components/shared/EmptyState'
import { FORCE_EMPTY_STATE_PREVIEW, emptyForPreview } from '@/src/lib/emptyStatePreview'

function sortedPcts(pcts: number[]): number[] {
  return [...pcts].sort((a, b) => a - b)
}

function pctArraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

const OTHER_LABEL = 'Other'

// Delete-group confirm copy: its categories go to Archive with it.
export function groupDeleteNote(categoryCount: number): string {
  if (categoryCount === 0) return 'You can restore it from Archive for 7 days.'
  const what = categoryCount === 1 ? 'Its 1 category goes' : `Its ${categoryCount} categories go`
  return `${what} to Archive too. You can restore them for 7 days.`
}
const ROW_HEIGHT = 45
// Group cards stack with these, and the group drag math depends on them matching the styles.
const GROUP_GAP = 10
const CARD_BORDER = 1
const SPRING = { damping: 90, stiffness: 900 }

function GroupChevron({ collapsed, color }: { collapsed: boolean; color: string }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: withSpring(collapsed ? '0deg' : '90deg', SPRING) }],
  }))
  return (
    <Reanimated.View style={style}>
      <Icon icon={ChevronRight} size={14} color={color} strokeWidth={2.5} />
    </Reanimated.View>
  )
}

// Open/close cannot use any layout animation. Reanimated's keeps owning a card's origin and
// size, which the drag's per-frame measure() reads, so a stale one survives a reorder and
// leaves the cards overlapping; RN's own LayoutAnimation is a no-op on Fabric. So layout
// changes land instantly and the motion is faked with transforms only: the body fades in,
// and every card that moved slides from where it was (see the FLIP in DraggableGroupCard).
// FLIP: layout has already moved the view by the time onLayout runs, so put it back by the
// distance it travelled and spring that offset away. Transform only, and always driven back
// to 0, so nothing ever owns where a card actually sits. Locked while a drag runs: the drag
// owns the offset then, and its commits must land instantly.
function useFlip(locked: boolean) {
  const offset = useSharedValue(0)
  const laidOutTop = useRef<number | null>(null)
  const lockedRef = useRef(locked)
  lockedRef.current = locked
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const top = e.nativeEvent.layout.y
      const previous = laidOutTop.current
      laidOutTop.current = top
      if (previous === null || previous === top || lockedRef.current) return
      offset.value = previous - top
      offset.value = withSpring(0, SPRING)
    },
    [offset],
  )
  return { offset, onLayout }
}

function GroupBody({ collapsed, style, children }: { collapsed: boolean; style: object; children: React.ReactNode }) {
  if (collapsed) return null
  return <FadingIn style={style}>{children}</FadingIn>
}

// The fade is a plain opacity animation, not an `entering` one. Reanimated's entering
// animations register the view with its layout-animation manager, which then also drives the
// view when it unmounts: collapsing a group slid its rows off to the right. A removed body
// must leave native layout immediately, on a lift as much as on a tap.
function FadingIn({ style, children }: { style: object; children: React.ReactNode }) {
  const opacity = useSharedValue(0)
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 180 })
  }, [opacity])
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Reanimated.View style={[style, fade]}>{children}</Reanimated.View>
}

function DraggableCategoryList({
  items,
  group,
  tokens,
  onReorder,
  onMenu,
}: {
  items: CategoryRow[]
  group: string
  tokens: ThemeTokens
  onReorder: (name: string, toIndex: number) => void
  onMenu: (name: string) => void
}) {
  // react-query's cache notifications land on a setTimeout(0), a tick after React's own
  // state updates commit — clearing drag state on drop would flash the old order for a
  // frame before the query catches up. Keep a local order, synced from items, and reorder
  // it synchronously on drop so both updates land in the same render.
  const [order, setOrder] = useState(() => items.map((c) => c.name))
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above: local order must be able to lead the items prop
    setOrder(items.map((c) => c.name))
  }, [items])
  const byName = useMemo(() => new Map(items.map((c) => [c.name, c])), [items])

  const rowHeight = useRef(ROW_HEIGHT)
  const dragY = useRef(new Animated.Value(0)).current
  const [drag, setDrag] = useState<{ name: string; start: number; target: number } | null>(null)
  // safe: ref kept fresh for the responders' stable closures, not render output
  const dragRef = useRef(drag)
  dragRef.current = drag

  // Index of each row by name, kept current every render so responders (created once, below)
  // always know the row's latest position without needing to be recreated mid-gesture.
  const indexRefs = useRef(new Map<string, { current: number }>())
  order.forEach((name, i) => {
    const ref = indexRefs.current.get(name)
    if (ref) ref.current = i
    else indexRefs.current.set(name, { current: i })
  })
  const orderLengthRef = useRef(order.length)
  orderLengthRef.current = order.length

  // PanResponder holds gesture-tracking state internally, so each row's instance must stay
  // stable across re-renders — recreating it mid-drag desyncs it from the live touch.
  const respondersRef = useRef(new Map<string, ReturnType<typeof PanResponder.create>>())
  function responderFor(name: string) {
    const existing = respondersRef.current.get(name)
    if (existing) return existing
    const indexRef = indexRefs.current.get(name)!
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragY.setValue(0)
        setDrag({ name, start: indexRef.current, target: indexRef.current })
      },
      onPanResponderMove: (_evt, gesture) => {
        dragY.setValue(gesture.dy)
        const prev = dragRef.current
        if (!prev || prev.name !== name) return
        const target = dragTarget(prev.start, gesture.dy, rowHeight.current, orderLengthRef.current)
        if (target === prev.target) return
        setDrag({ ...prev, target })
      },
      onPanResponderRelease: () => {
        dragY.setValue(0)
        const prev = dragRef.current
        setDrag(null)
        if (prev && prev.name === name && prev.target !== prev.start) {
          setOrder((cur) => moveItem(cur, prev.name, prev.target))
          onReorder(prev.name, prev.target)
        }
      },
      onPanResponderTerminate: () => {
        dragY.setValue(0)
        setDrag(null)
      },
    })
    respondersRef.current.set(name, responder)
    return responder
  }

  return (
    <>
      {order.map((name, i) => {
        const cat = byName.get(name)
        if (!cat) return null
        const isDragging = drag?.name === cat.name
        const shift = drag && !isDragging ? dragShift(i, drag.start, drag.target) : 0
        const responder = responderFor(cat.name)
        return (
          <Animated.View
            key={cat.name}
            onLayout={(e) => {
              rowHeight.current = e.nativeEvent.layout.height
            }}
            style={[
              styles.catRow,
              { borderTopColor: tokens.border },
              isDragging
                ? {
                    transform: [{ translateY: dragY }],
                    zIndex: 10,
                    elevation: 4,
                    backgroundColor: tokens.chipActiveBg,
                  }
                : shift !== 0
                  ? { transform: [{ translateY: shift * rowHeight.current }] }
                  : null,
            ]}
          >
            <Pressable style={styles.catRowMain} onPress={() => onMenu(cat.name)}>
              <View style={[styles.catIconChip, { backgroundColor: tokens.inputBg }]}>
                <Text style={{ fontSize: 12 }}>{categoryEmoji(cat.name, group)}</Text>
              </View>
              <Text
                style={[styles.catName, { color: tokens.text, fontFamily: fontFamily.bodyBold }]}
                numberOfLines={1}
              >
                {splitEmoji(cat.name).text}
              </Text>
              <View style={styles.catActions}>
                <View {...responder.panHandlers} hitSlop={8} style={styles.dragHandle}>
                  <Icon icon={Equal} size={14} color={tokens.text3} />
                </View>
              </View>
            </Pressable>
          </Animated.View>
        )
      })}
    </>
  )
}

// One drag session shared by every group card. Positions are never cached from onLayout:
// each frame, every card measures where layout actually put it and translates itself to
// where it should *look*, so collapse, scroll clamping and the reorder commit can land on
// any frame without the cards jumping.
type GroupDragValues = {
  active: SharedValue<boolean>
  session: SharedValue<number>
  name: SharedValue<string>
  order: SharedValue<string[]>
  from: SharedValue<number>
  target: SharedValue<number>
  dropping: SharedValue<boolean>
  step: SharedValue<number>
}

const LONG_PRESS_MS = 350
const LIFT_SLOP = 4
const GRIP = 1
const LONG_PRESS = 2

function DraggableGroupCard({
  name,
  draggable,
  drag,
  listRef,
  dragging,
  settling,
  dropCount,
  lifted,
  onLift,
  onDrop,
  cardStyle,
  liftedStyle,
  handleColor,
  renderHeader,
  children,
}: {
  name: string
  draggable: boolean
  drag: GroupDragValues
  listRef: AnimatedRef<Reanimated.View>
  dragging: boolean
  settling: boolean
  dropCount: number
  lifted: boolean
  onLift: (name: string) => void
  onDrop: (name: string, from: number, to: number) => void
  cardStyle: object
  liftedStyle: object
  handleColor: string
  renderHeader: (handle: React.ReactNode) => React.ReactNode
  children: React.ReactNode
}) {
  const cardRef = useAnimatedRef<Reanimated.View>()
  // Card top within the list, where it should look like it is (animated for non-held cards).
  const shownTop = useSharedValue(0)
  const translate = useSharedValue(0)
  // How far this card still has to slide from where layout last put it, so a collapse or
  // expand elsewhere in the list reads as motion instead of a jump.
  const { offset: flip, onLayout: onCardLayout } = useFlip(dragging)
  const shownIndex = useSharedValue(-1)
  const seenSession = useSharedValue(-1)
  const fingerY = useSharedValue(0)
  const grabDelta = useSharedValue(0)
  // Which of this card's two gestures owns the drag, so the grip and the long press never both drive it.
  const owner = useSharedValue(0)

  // Worklets hand these back to the JS thread, so they must be stable JS-side functions.
  const onLiftRef = useRef(onLift)
  onLiftRef.current = onLift
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop
  const lift = useCallback(() => onLiftRef.current(name), [name])
  const drop = useCallback((from: number, to: number) => onDropRef.current(name, from, to), [name])

  const follow = useCallback(() => {
    'worklet'
    const list = measure(listRef)
    const card = measure(cardRef)
    if (!list || !card) return
    const layoutTop = card.pageY - list.pageY
    if (seenSession.value !== drag.session.value) {
      seenSession.value = drag.session.value
      shownTop.value = layoutTop
      shownIndex.value = -1
    }
    if (drag.name.value === name) {
      if (!drag.dropping.value) {
        shownTop.value = fingerY.value - grabDelta.value - list.pageY
        drag.target.value = dragTarget(0, shownTop.value, drag.step.value, drag.order.value.length)
      }
    } else {
      const order = drag.order.value
      const i = order.indexOf(name) === -1 ? order.length : order.indexOf(name)
      const slot = i + dragShift(i, drag.from.value, drag.target.value)
      if (slot !== shownIndex.value) {
        shownIndex.value = slot
        shownTop.value = withSpring(slot * drag.step.value, SPRING)
      }
    }
    translate.value = shownTop.value - layoutTop
  }, [name, drag, listRef, cardRef, seenSession, shownTop, shownIndex, fingerY, grabDelta, translate])

  const frameCallback = useFrameCallback(
    useCallback(() => {
      'worklet'
      if (drag.active.value) follow()
    }, [drag, follow]),
    false,
  )
  useEffect(() => {
    frameCallback.setActive(dragging)
  }, [dragging, frameCallback])

  const gestures = useMemo(() => {
    function start() {
      'worklet'
      const from = drag.order.value.indexOf(name)
      const list = measure(listRef)
      const card = measure(cardRef)
      if (from < 0 || !list || !card) return
      drag.session.value += 1
      // Initialize before release can start a drop animation. Otherwise a long
      // press released before the first frame cancels that animation in follow().
      seenSession.value = drag.session.value
      shownTop.value = card.pageY - list.pageY
      shownIndex.value = -1
      translate.value = 0
      drag.name.value = name
      drag.from.value = from
      drag.target.value = from
      drag.dropping.value = false
      drag.active.value = true
      flip.value = 0
      scheduleOnRN(lift)
    }
    function finish(success: boolean) {
      'worklet'
      const session = drag.session.value
      const from = drag.from.value
      const to = success ? drag.target.value : from
      const next = drag.order.value.filter((n) => n !== name)
      next.splice(to, 0, name)
      // Everyone else's slot is already where the new order puts them, so swapping the order
      // in with from = target leaves them all still. Only the held card glides home.
      drag.dropping.value = true
      drag.order.value = next
      drag.from.value = to
      drag.target.value = to
      shownTop.value = withTiming(to * drag.step.value, { duration: 180 }, (finished) => {
        if (finished && drag.active.value && drag.session.value === session && drag.name.value === name) {
          scheduleOnRN(drop, from, to)
        }
      })
    }
    function pan(id: number) {
      const gesture = Gesture.Pan()
        .enabled(draggable)
        .onStart((e) => {
          if (drag.active.value) return
          owner.value = id
          fingerY.value = e.absoluteY
          const card = measure(cardRef)
          grabDelta.value = card ? e.absoluteY - card.pageY : 0
          if (id === LONG_PRESS) start()
        })
        .onUpdate((e) => {
          if (owner.value !== id) return
          fingerY.value = e.absoluteY
          if (!drag.active.value) {
            if (Math.abs(e.translationY) < LIFT_SLOP) return
            start()
          }
          if (drag.active.value && drag.name.value === name && !drag.dropping.value) follow()
        })
        .onFinalize((_event, success) => {
          if (owner.value !== id) return
          owner.value = 0
          if (drag.active.value && drag.name.value === name && !drag.dropping.value) finish(success)
        })
      return id === LONG_PRESS ? gesture.activateAfterLongPress(LONG_PRESS_MS) : gesture.minDistance(0)
    }
    return { grip: pan(GRIP), longPress: pan(LONG_PRESS) }
  }, [name, draggable, drag, cardRef, listRef, owner, fingerY, grabDelta, shownTop, seenSession, shownIndex, translate, flip, follow, lift, drop])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          !settling && drag.active.value && seenSession.value === drag.session.value ? translate.value : flip.value,
      },
    ],
  }))

  const handle = draggable ? (
    <GestureDetector gesture={gestures.grip}>
      <View hitSlop={8} style={styles.dragHandle} accessibilityLabel={`Drag to reorder ${splitEmoji(name).text}`}>
        <Icon icon={Equal} size={15} color={handleColor} />
      </View>
    </GestureDetector>
  ) : null

  return (
    <Reanimated.View
      ref={cardRef}
      collapsable={false}
      onLayout={onCardLayout}
      style={lifted ? styles.draggingCard : null}
    >
      {/* Only the inner view translates; this measured wrapper never has a native layout
          animation that could keep writing an obsolete origin after a reorder.
          A new key on every drop remounts this view in the same React commit as the reorder.
          Its first style comes from that commit (settling, so no offset), instead of the UI
          thread zeroing the offset a frame before the new order is on screen. */}
      <Reanimated.View key={dropCount} style={[cardStyle, lifted ? liftedStyle : null, animatedStyle]}>
        <GestureDetector gesture={gestures.longPress}>
          <View collapsable={false}>{renderHeader(handle)}</View>
        </GestureDetector>
        {children}
      </Reanimated.View>
    </Reanimated.View>
  )
}

type SheetState =
  | { kind: 'addCategory' }
  | { kind: 'renameCategory'; name: string }
  | { kind: 'addGroup' }
  | { kind: 'renameGroup'; name: string }

export default function EnvelopesScreen() {
  const { tokens } = useTheme()
  const { refreshing, onRefresh } = useRefresh()
  const insets = useSafeAreaInsets()
  const navPadding = useNavPadding()
  const online = useOnline()

  const categoriesQ = useCategories()
  const groupsQ = useGroups()
  const addCategory = useAddCategory()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()
  const moveCategory = useMoveCategory()
  const addGroup = useAddGroup()
  const updateGroup = useUpdateGroup()
  const deleteGroup = useDeleteGroup()
  const moveGroup = useMoveGroup()

  const [collapsedGroups, setCollapsedGroups] = useCollapsedGroups('envelopes')

  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [menuTarget, setMenuTarget] = useState<{ kind: 'category' | 'group'; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'category' | 'group'; name: string } | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftGroup, setDraftGroup] = useState('')
  const [draftAlertPcts, setDraftAlertPcts] = useState<number[]>(DEFAULT_ALERT_PCTS)
  const [customAlertInput, setCustomAlertInput] = useState('')
  const [sheetError, setSheetError] = useState('')
  const [sheetSuccess, setSheetSuccess] = useState(false)

  const [deletingGroup, setDeletingGroup] = useState(false)

  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  function showToast(msg: string) {
    clearTimeout(toastTimer.current)
    setToastMsg(msg)
    toastTimer.current = setTimeout(() => setToastMsg(null), 1700)
  }

  const categories = emptyForPreview(categoriesQ.data ?? EMPTY)
  const groups = emptyForPreview(groupsQ.data ?? EMPTY)

  // Group drag-to-reorder. Same local-order and stable-responder approach as
  // DraggableCategoryList (see the comments there). On top of that, every group collapses to
  // its header while one is dragged, so each slot is one uniform header height plus gap.
  const [groupOrder, setGroupOrder] = useState<string[]>(groups)
  // The UI-thread lock spans dragging, the reorder commit, and restoring expanded bodies.
  const [dragPhase, setDragPhase] = useState<'idle' | 'dragging' | 'settling' | 'restoring'>('idle')
  useEffect(() => {
    if (dragPhase !== 'idle' || moveGroup.isPending) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- defer query updates until the current gesture and queued writes settle
    setGroupOrder(groups)
  }, [groups, dragPhase, moveGroup.isPending])
  // The footer sits under the list, so it slides with the cards instead of jumping.
  const footerFlip = useFlip(dragPhase !== 'idle')
  const footerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: footerFlip.offset.value }] }))
  const [liftedGroup, setLiftedGroup] = useState<string | null>(null)
  const [dropCount, setDropCount] = useState(0)
  const listRef = useAnimatedRef<Reanimated.View>()
  const dragActive = useSharedValue(false)
  const dragSession = useSharedValue(0)
  const dragName = useSharedValue('')
  const dragOrder = useSharedValue<string[]>(groupOrder)
  const dragFrom = useSharedValue(-1)
  const dragTo = useSharedValue(-1)
  const dragDropping = useSharedValue(false)
  const dragStep = useSharedValue(62 + CARD_BORDER * 2 + GROUP_GAP)
  // Must keep one identity: the cards memoize their gestures and frame callbacks on it, and
  // recreating those mid-drag re-registers them on the UI thread.
  const groupDrag = useMemo<GroupDragValues>(
    () => ({
      active: dragActive,
      session: dragSession,
      name: dragName,
      order: dragOrder,
      from: dragFrom,
      target: dragTo,
      dropping: dragDropping,
      step: dragStep,
    }),
    [dragActive, dragSession, dragName, dragOrder, dragFrom, dragTo, dragDropping, dragStep],
  )
  useEffect(() => {
    if (dragPhase === 'idle' && !groupDrag.active.value) groupDrag.order.value = groupOrder
  }, [groupOrder, dragPhase, groupDrag])

  function liftGroup(name: string) {
    Haptics.selectionAsync().catch(() => {})
    setLiftedGroup(name)
    setDragPhase('dragging')
  }

  function dropGroup(name: string, from: number, to: number) {
    setDropCount((n) => n + 1)
    setLiftedGroup(null)
    if (to !== from) {
      setGroupOrder((cur) => moveItem(cur, name, to))
      moveGroup.mutate({ name, toIndex: to }, { onError: () => showToast('Could not save group order. Please try again.') })
    }
    setDragPhase('settling')
  }

  // Keep the UI-thread lock until the reordered list AND restored bodies have committed.
  // Restoring in its own phase prevents effect cleanup from canceling the reopen frame.
  useEffect(() => {
    if (dragPhase !== 'settling' && dragPhase !== 'restoring') return
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (dragPhase === 'settling') {
          setDragPhase('restoring')
        } else {
          groupDrag.active.value = false
          groupDrag.name.value = ''
          groupDrag.dropping.value = false
          setDragPhase('idle')
        }
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [dragPhase, groupDrag])

  const groupedCategories = useMemo(() => {
    const byGroup = new Map<string, CategoryRow[]>()
    for (const c of categories) {
      const g = c.group || ''
      const arr = byGroup.get(g) ?? []
      arr.push(c)
      byGroup.set(g, arr)
    }
    const named = groupOrder.map((g) => ({ name: g, items: byGroup.get(g) ?? [] }))
    const other = byGroup.get('') ?? []
    return other.length > 0 ? [...named, { name: '', items: other }] : named
  }, [categories, groupOrder])

  const allGroupKeys = groupedCategories.map((g) => g.name || OTHER_LABEL)
  const allGroupsCollapsed = allGroupKeys.length > 0 && allGroupKeys.every((k) => collapsedGroups.has(k))

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function toggleCollapseAll() {
    setCollapsedGroups(allGroupsCollapsed ? new Set() : new Set(allGroupKeys))
  }

  function openAddCategory(group = '') {
    setDraftName('')
    setDraftGroup(group)
    setDraftAlertPcts(DEFAULT_ALERT_PCTS)
    setCustomAlertInput('')
    setSheetError('')
    setSheet({ kind: 'addCategory' })
  }
  function openRenameCategory(name: string) {
    const cat = categories.find((c) => c.name === name)
    setDraftName(name)
    setDraftGroup(cat?.group ?? '')
    setDraftAlertPcts(cat?.alertPcts ? sortedPcts(cat.alertPcts) : DEFAULT_ALERT_PCTS)
    setCustomAlertInput('')
    setSheetError('')
    setSheet({ kind: 'renameCategory', name })
  }
  function togglePresetPct(pct: number) {
    setDraftAlertPcts((prev) => {
      if (prev.includes(pct)) return prev.filter((p) => p !== pct)
      if (prev.length >= MAX_ALERT_PCTS) return prev
      return sortedPcts([...prev, pct])
    })
  }
  function addCustomAlertPct() {
    const n = Math.round(Number(customAlertInput))
    if (!customAlertInput.trim() || Number.isNaN(n) || n < 0 || n > 100) return
    setCustomAlertInput('')
    setDraftAlertPcts((prev) => {
      if (prev.includes(n) || prev.length >= MAX_ALERT_PCTS) return prev
      return sortedPcts([...prev, n])
    })
  }
  function openAddGroup() {
    setDraftName('')
    setSheetError('')
    setSheet({ kind: 'addGroup' })
  }
  function openRenameGroup(name: string) {
    setDraftName(name)
    setSheetError('')
    setSheet({ kind: 'renameGroup', name })
  }
  function closeSheet() {
    setSheet(null)
    setSheetError('')
    setSheetSuccess(false)
  }

  // Let the inline checkmark finish drawing before closing the sheet.
  useEffect(() => {
    if (!sheetSuccess) return
    const timer = setTimeout(closeSheet, 1100)
    return () => clearTimeout(timer)
  }, [sheetSuccess])

  const submitting =
    addCategory.isPending || updateCategory.isPending || addGroup.isPending || updateGroup.isPending

  async function submitSheet() {
    if (!sheet) return
    const composed = draftName.trim()
    if (!composed) return
    try {
      if (sheet.kind === 'addCategory') {
        await addCategory.mutateAsync({ name: composed, group: draftGroup })
      } else if (sheet.kind === 'renameCategory') {
        const current = categories.find((c) => c.name === sheet.name)
        const currentGroup = current?.group ?? ''
        const currentAlertPcts = current?.alertPcts ? sortedPcts(current.alertPcts) : DEFAULT_ALERT_PCTS
        const sortedDraft = sortedPcts(draftAlertPcts)
        const updates: { newName?: string; group?: string; alertPcts?: number[] | null } = {}
        if (composed !== sheet.name) updates.newName = composed
        if (draftGroup !== currentGroup) updates.group = draftGroup
        if (!pctArraysEqual(sortedDraft, currentAlertPcts)) {
          updates.alertPcts = pctArraysEqual(sortedDraft, DEFAULT_ALERT_PCTS) ? null : sortedDraft
        }
        if (Object.keys(updates).length > 0) {
          await updateCategory.mutateAsync({ name: sheet.name, updates })
        }
      } else if (sheet.kind === 'addGroup') {
        await addGroup.mutateAsync(composed)
      } else {
        if (composed !== sheet.name) {
          await updateGroup.mutateAsync({ name: sheet.name, newName: composed })
        }
      }
      setSheetSuccess(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setSheetError(
        msg.includes('already exists') ? 'That name is already taken. Try a different name.' : 'Something went wrong. Try again.',
      )
    }
  }

  function runDeleteCategory(name: string) {
    deleteCategory.mutate(name, { onSuccess: () => showToast(`${splitEmoji(name).text} removed`) })
  }
  // Server sends the group's categories to Archive along with it.
  async function runDeleteGroup(name: string) {
    setDeletingGroup(true)
    try {
      await deleteGroup.mutateAsync(name)
    } finally {
      setDeletingGroup(false)
      setDeleteTarget(null)
    }
  }
  function requestDelete(kind: 'category' | 'group', name: string) {
    setMenuTarget(null)
    setDeleteTarget({ kind, name })
  }
  function openCategoryMenu(name: string) {
    setMenuTarget({ kind: 'category', name })
  }
  function openGroupMenu(name: string) {
    setMenuTarget({ kind: 'group', name })
  }

  const isLoading = !FORCE_EMPTY_STATE_PREVIEW && (categoriesQ.isLoading || groupsQ.isLoading)
  // A failed refresh keeps the last good data, so only a query with nothing to show is an error.
  const hasError = !FORCE_EMPTY_STATE_PREVIEW && [categoriesQ, groupsQ].some((q) => q.error && q.data === undefined)

  if (hasError && !online) return <OfflineScreen />

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <LoadingCaption />
      </View>
    )
  }

  if (hasError) {
    return (
      <ErrorScreen
        title="Couldn't load your categories"
        message="Check your connection and try again."
        onRetry={() => {
          categoriesQ.refetch()
          groupsQ.refetch()
        }}
      />
    )
  }

  const isCatSheet = sheet?.kind === 'addCategory' || sheet?.kind === 'renameCategory'
  const isRenameSheet = sheet?.kind === 'renameCategory' || sheet?.kind === 'renameGroup'
  const previewIcon = isCatSheet ? categoryEmoji(draftName, draftGroup) : groupEmoji(draftName)
  const draftHasEmoji = splitEmoji(draftName).icon !== ''
  const sheetTitle =
    sheet?.kind === 'addCategory'
      ? 'Add category'
      : sheet?.kind === 'renameCategory'
        ? 'Edit category'
        : sheet?.kind === 'addGroup'
          ? 'Add group'
          : 'Rename group'
  const sheetHint = isCatSheet
    ? 'Categories live inside a group. Pick where this one belongs.'
    : 'Groups gather related categories: Food, Home, Transport.'
  const draftValid = draftName.trim().length > 0
  const saveLabel = submitting ? 'Saving…' : isCatSheet ? (isRenameSheet ? 'Save' : 'Add category') : isRenameSheet ? 'Save' : 'Create group'

  return (
    <AnimatedTabContent>
      <Screen
        title="Envelopes"
        actions={<IconButton icon={Plus} accessibilityLabel="New group" onPress={openAddGroup} />}
        scroll={false}
      >
        <View style={styles.metaRow}>
          <Text style={{ color: tokens.text3, fontSize: 11, fontFamily: fontFamily.bodyMedium }}>
            {groups.length} group{groups.length === 1 ? '' : 's'} · {categories.length} categor
            {categories.length === 1 ? 'y' : 'ies'}
          </Text>
          <View style={styles.metaActions}>
            <Chip
              label={allGroupsCollapsed ? 'Expand all' : 'Collapse all'}
              onPress={toggleCollapseAll}
            />
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: navPadding },
            groupedCategories.length === 0 && styles.emptyScroll,
          ]}
          scrollEnabled={dragPhase === 'idle'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              enabled={dragPhase === 'idle'}
              tintColor={tokens.accent}
              colors={[tokens.accent]}
            />
          }
        >
          {groupedCategories.length === 0 ? (
            <EmptyState
              subject="envelopes"
              title="Your envelopes are waiting"
              description="Make a group, add a category, and give every rupee a place to land."
              action={{ label: "Create your first group", onPress: openAddGroup }}
            />
          ) : (
            <>
              <Reanimated.View ref={listRef} collapsable={false} style={styles.groupList}>
                {groupedCategories.map(({ name, items }) => {
              const key = name || OTHER_LABEL
              const collapsed = dragPhase === 'dragging' || dragPhase === 'settling' || collapsedGroups.has(key)
              return (
                <DraggableGroupCard
                  key={key}
                  name={name}
                  draggable={name !== ''}
                  drag={groupDrag}
                  listRef={listRef}
                  dragging={dragPhase !== 'idle'}
                  settling={dragPhase !== 'dragging'}
                  dropCount={dropCount}
                  lifted={name !== '' && liftedGroup === name}
                  onLift={liftGroup}
                  onDrop={dropGroup}
                  cardStyle={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}
                  liftedStyle={{ elevation: 4, backgroundColor: tokens.chipActiveBg }}
                  handleColor={tokens.text3}
                  renderHeader={(handle) => (
                    <Pressable
                      style={styles.groupHeader}
                      onPress={() => toggleGroup(key)}
                      onLayout={(e) => {
                        groupDrag.step.value = e.nativeEvent.layout.height + CARD_BORDER * 2 + GROUP_GAP
                      }}
                    >
                      <Pressable onPress={() => toggleGroup(key)} hitSlop={8} style={styles.chevronBtn}>
                        <GroupChevron collapsed={collapsed} color={tokens.text3} />
                      </Pressable>
                      <View style={[styles.avatarChip, { backgroundColor: tokens.accentSoft }]}>
                        <Text style={{ fontSize: 16 }}>{name ? groupEmoji(name) : '📁'}</Text>
                      </View>
                      <View style={styles.groupHeaderLeft}>
                        <Text
                          style={[styles.groupName, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}
                          numberOfLines={1}
                        >
                          {name ? splitEmoji(name).text : OTHER_LABEL}
                        </Text>
                        <Text style={{ color: tokens.text3, fontSize: 10, marginTop: 2, fontFamily: fontFamily.bodyMedium }}>
                          {items.length === 0 ? 'empty' : `${items.length} categor${items.length === 1 ? 'y' : 'ies'}`}
                        </Text>
                      </View>
                      {name !== '' && (
                        <Pressable onPress={() => openGroupMenu(name)} hitSlop={8}>
                          <Icon icon={MoreVertical} size={17} color={tokens.text3} />
                        </Pressable>
                      )}
                      {handle}
                    </Pressable>
                  )}
                >
                  <GroupBody collapsed={collapsed} style={styles.groupBody}>
                    <DraggableCategoryList
                      items={items}
                      group={name}
                      tokens={tokens}
                      onReorder={(catName, toIndex) => moveCategory.mutate({ name: catName, toIndex })}
                      onMenu={openCategoryMenu}
                    />

                    {items.length === 0 ? (
                      <Pressable
                        onPress={() => openAddCategory(name)}
                        style={[styles.addFirstCatBtn, { borderColor: tokens.borderStrong }]}
                      >
                        <Icon icon={Plus} size={14} color={tokens.accent} strokeWidth={2.5} />
                        <Text style={{ color: tokens.accent, fontSize: 13, fontFamily: fontFamily.bodyBold }}>
                          Add first category
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => openAddCategory(name)}
                        style={[styles.addCatRow, { borderTopColor: tokens.border }]}
                      >
                        <View style={[styles.dashedIconChip, { borderColor: tokens.accent }]}>
                          <Icon icon={Plus} size={12} color={tokens.accent} strokeWidth={3} />
                        </View>
                        <Text style={{ color: tokens.accent, fontSize: 13, fontFamily: fontFamily.bodyBold }}>
                          Add category
                        </Text>
                      </Pressable>
                    )}
                  </GroupBody>
                </DraggableGroupCard>
              )
                })}
              </Reanimated.View>

              <Reanimated.View onLayout={footerFlip.onLayout} style={footerStyle}>
                <Pressable
                  onPress={openAddGroup}
                  style={[styles.addGroupBtn, { borderColor: tokens.borderStrong }]}
                >
                  <Icon icon={Plus} size={14} color={tokens.text2} strokeWidth={2.5} />
                  <Text style={{ color: tokens.text2, fontSize: 13, fontFamily: fontFamily.bodyBold }}>New group</Text>
                </Pressable>
                <Text style={{ color: tokens.text3, fontSize: 10, textAlign: 'center', marginTop: 2, fontFamily: fontFamily.bodyMedium }}>
                  Tap a group to collapse · drag a handle to reorder
                </Text>
              </Reanimated.View>
            </>
          )}
        </ScrollView>

      <BottomSheet visible={sheet !== null} onClose={closeSheet}>
        <View style={[styles.sheetHandle, { backgroundColor: tokens.borderStrong }]} />
        <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
          {sheetTitle}
        </Text>
        <Text style={{ color: tokens.text2, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{sheetHint}</Text>

        <Text style={[styles.sectionLabel, { color: tokens.text3 }]}>NAME</Text>
        <View style={styles.nameRow}>
          <View style={[styles.iconSwatch, { backgroundColor: tokens.inputBg, borderColor: tokens.borderStrong }]}>
            <Text style={{ fontSize: 22 }}>{previewIcon}</Text>
          </View>
          <TextInput
            style={[styles.input, { backgroundColor: tokens.inputBg, borderColor: tokens.borderStrong, color: tokens.text }]}
            value={draftName}
            onChangeText={setDraftName}
            placeholder={isCatSheet ? 'Groceries, fuel, gym…' : 'Transport, Health…'}
            placeholderTextColor={tokens.text3}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submitSheet}
          />
        </View>
        {draftName.trim() !== '' && !draftHasEmoji && (
          <Text style={{ color: tokens.text3, fontSize: 11, marginTop: 6, lineHeight: 15 }}>
            💡 Tip: start the name with an emoji, like {isCatSheet ? '🛒 Groceries' : '🚗 Transport'}, to give it its own icon.
          </Text>
        )}

        {isCatSheet && (
          <>
            <Text style={[styles.sectionLabel, { color: tokens.text3 }]}>GROUP</Text>
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => setDraftGroup('')}
                style={[
                  styles.chip,
                  {
                    backgroundColor: draftGroup === '' ? tokens.accent : tokens.inputBg,
                    borderColor: draftGroup === '' ? tokens.accent : tokens.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: draftGroup === '' ? tokens.onAccent : tokens.text2,
                    fontSize: 12,
                    fontFamily: fontFamily.bodyBold,
                  }}
                >
                  Other
                </Text>
              </Pressable>
              {groups.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setDraftGroup(g)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: draftGroup === g ? tokens.accent : tokens.inputBg,
                      borderColor: draftGroup === g ? tokens.accent : tokens.border,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 13 }}>{groupEmoji(g)}</Text>
                  <Text
                    style={{
                      color: draftGroup === g ? tokens.onAccent : tokens.text2,
                      fontSize: 12,
                      fontFamily: fontFamily.bodyBold,
                    }}
                  >
                    {splitEmoji(g).text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {sheet?.kind === 'renameCategory' && (
          <>
            <Text style={[styles.sectionLabel, { color: tokens.text3 }]}>ALERT AT</Text>
            <View style={styles.chipRow}>
              {ALERT_PRESET_PCTS.map((pct) => {
                const selected = draftAlertPcts.includes(pct)
                const disabled = !selected && draftAlertPcts.length >= MAX_ALERT_PCTS
                return (
                  <Pressable
                    key={pct}
                    disabled={disabled}
                    onPress={() => togglePresetPct(pct)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? tokens.accent : tokens.inputBg,
                        borderColor: selected ? tokens.accent : tokens.border,
                        opacity: disabled ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selected ? tokens.onAccent : tokens.text2,
                        fontSize: 12,
                        fontFamily: fontFamily.bodyBold,
                      }}
                    >
                      {pct}%
                    </Text>
                  </Pressable>
                )
              })}
              {draftAlertPcts
                .filter((pct) => !ALERT_PRESET_PCTS.includes(pct))
                .map((pct) => (
                  <Pressable
                    key={pct}
                    onPress={() => togglePresetPct(pct)}
                    style={[styles.chip, { backgroundColor: tokens.accent, borderColor: tokens.accent }]}
                  >
                    <Text style={{ color: tokens.onAccent, fontSize: 12, fontFamily: fontFamily.bodyBold }}>{pct}%</Text>
                  </Pressable>
                ))}
            </View>
            <View style={styles.customAlertRow}>
              <TextInput
                style={[
                  styles.customAlertInput,
                  { backgroundColor: tokens.inputBg, borderColor: tokens.borderStrong, color: tokens.text },
                ]}
                value={customAlertInput}
                onChangeText={setCustomAlertInput}
                placeholder="Custom"
                placeholderTextColor={tokens.text3}
                keyboardType="number-pad"
                maxLength={3}
                editable={draftAlertPcts.length < MAX_ALERT_PCTS}
                returnKeyType="done"
                onSubmitEditing={addCustomAlertPct}
              />
              <Pressable
                onPress={addCustomAlertPct}
                disabled={draftAlertPcts.length >= MAX_ALERT_PCTS || !customAlertInput.trim()}
                style={[
                  styles.customAlertAddBtn,
                  {
                    backgroundColor: tokens.inputBg,
                    borderColor: tokens.borderStrong,
                    opacity: draftAlertPcts.length >= MAX_ALERT_PCTS || !customAlertInput.trim() ? 0.4 : 1,
                  },
                ]}
              >
                <Text style={{ color: tokens.text2, fontSize: 12, fontFamily: fontFamily.bodyBold }}>Add</Text>
              </Pressable>
            </View>
            <Text style={{ color: tokens.text3, fontSize: 11, marginTop: 6 }}>
              {draftAlertPcts.length}/{MAX_ALERT_PCTS} selected
              {draftAlertPcts.length >= MAX_ALERT_PCTS ? ` · You can only select up to ${MAX_ALERT_PCTS} options.` : ''}
            </Text>
          </>
        )}

        {sheetError !== '' && (
          <Text style={{ color: tokens.coral, fontSize: 12, marginTop: 8 }}>{sheetError}</Text>
        )}

        <View style={styles.sheetActions}>
          <Pressable
            style={[
              styles.saveBtn,
              {
                backgroundColor: sheetSuccess ? tokens.mint : draftValid ? tokens.accent : tokens.inputBg,
                opacity: submitting ? 0.6 : 1,
              },
            ]}
            onPress={submitSheet}
            disabled={submitting || !draftValid || sheetSuccess}
          >
            {sheetSuccess ? (
              <CheckIcon color={tokens.onAccent} />
            ) : (
              <Text style={{ color: draftValid ? tokens.onAccent : tokens.text3, fontFamily: fontFamily.bodyBold }}>
                {saveLabel}
              </Text>
            )}
          </Pressable>
        </View>
      </BottomSheet>

      <BottomSheet visible={menuTarget !== null} onClose={() => setMenuTarget(null)}>
        <Text style={[styles.menuTitle, { color: tokens.text2 }]} numberOfLines={1}>
          {menuTarget ? splitEmoji(menuTarget.name).text : ''}
        </Text>
        <SheetOption
          label={menuTarget?.kind === 'category' ? 'Edit' : 'Rename'}
          color={tokens.text}
          onPress={() => {
            if (!menuTarget) return
            const { kind, name } = menuTarget
            setMenuTarget(null)
            if (kind === 'category') openRenameCategory(name)
            else openRenameGroup(name)
          }}
        />
        <SheetOption
          label="Delete"
          color={tokens.coral}
          onPress={() => menuTarget && requestDelete(menuTarget.kind, menuTarget.name)}
        />
        <SheetOption label="Cancel" color={tokens.text2} onPress={() => setMenuTarget(null)} />
      </BottomSheet>

      <BottomSheet visible={deleteTarget !== null} onClose={() => !deletingGroup && setDeleteTarget(null)}>
        <Text style={[styles.confirmTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>
          {deleteTarget?.kind === 'group' ? 'Delete group' : 'Remove category'}
        </Text>
        <Text style={[styles.confirmBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]} numberOfLines={3}>
          {deleteTarget?.kind === 'group'
            ? `Delete "${deleteTarget ? splitEmoji(deleteTarget.name).text : ''}"? ${groupDeleteNote(categories.filter((c) => (c.group || '') === deleteTarget?.name).length)}`
            : `Remove "${deleteTarget ? splitEmoji(deleteTarget.name).text : ''}"? Past transactions are kept.`}
        </Text>
        <SheetOption
          label={deleteTarget?.kind === 'group' ? (deletingGroup ? 'Deleting…' : 'Delete') : 'Remove'}
          color={tokens.coral}
          disabled={deletingGroup}
          onPress={() => {
            if (!deleteTarget) return
            if (deleteTarget.kind === 'group') {
              runDeleteGroup(deleteTarget.name)
              return
            }
            runDeleteCategory(deleteTarget.name)
            setDeleteTarget(null)
          }}
        />
        <SheetOption label="Cancel" color={tokens.text2} disabled={deletingGroup} onPress={() => setDeleteTarget(null)} />
      </BottomSheet>

      {toastMsg && (
        <View
          pointerEvents="none"
          style={[
            styles.toast,
            { bottom: insets.bottom + 76, backgroundColor: tokens.pillBg, borderColor: tokens.borderStrong },
          ]}
        >
          <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyBold, fontSize: 13 }}>{toastMsg}</Text>
        </View>
      )}
      </Screen>
    </AnimatedTabContent>
  )
}

function SheetOption({
  label,
  color,
  onPress,
  disabled,
}: {
  label: string
  color: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.sheetOption, disabled && { opacity: 0.5 }]}>
      <Text style={[styles.sheetOptionText, { color, fontFamily: fontFamily.bodySemiBold }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingBottom: 12 },
  metaActions: { flexDirection: 'row', gap: 8 },
  scrollContent: { paddingVertical: 4, gap: GROUP_GAP },
  emptyScroll: { flexGrow: 1, justifyContent: 'center' },
  groupList: { gap: GROUP_GAP },
  card: { borderRadius: 20, borderWidth: CARD_BORDER, overflow: 'hidden' },
  draggingCard: { zIndex: 10 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 },
  chevronBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  avatarChip: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  groupHeaderLeft: { flex: 1, minWidth: 0 },
  groupName: { fontSize: 15 },
  dragHandle: { paddingLeft: 2 },
  groupBody: { paddingHorizontal: 13, paddingLeft: 46 },
  catRow: { borderTopWidth: 1 },
  catRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  catIconChip: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  catName: { fontSize: 14, flex: 1, flexShrink: 1 },
  catActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addFirstCatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 2, marginBottom: 13, padding: 14, borderRadius: 15, borderWidth: 1, borderStyle: 'dashed' },
  addCatRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, paddingBottom: 13, borderTopWidth: 1 },
  dashedIconChip: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addGroupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 22, paddingVertical: 16 },
  sheetHandle: { width: 38, height: 4, borderRadius: 100, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.8, marginTop: 18, marginBottom: 8 },
  nameRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  iconSwatch: { width: 52, minHeight: 56, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  input: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  customAlertRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  customAlertInput: { flex: 1, borderWidth: 1, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8, fontSize: 12 },
  customAlertAddBtn: { paddingHorizontal: 16, borderRadius: 100, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, textAlign: 'center' },
  confirmTitle: { fontSize: 17, textAlign: 'center', marginBottom: 6 },
  confirmBody: { fontSize: 13, textAlign: 'center', marginBottom: 8 },
  sheetOption: { paddingVertical: 14, alignItems: 'center' },
  sheetOptionText: { fontSize: 16 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  saveBtn: { flex: 1, paddingVertical: 15, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 24, right: 24, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 100, borderWidth: 1 },
})
