import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { CheckIcon } from '@/src/components/shared/CheckIcon'
import { CalendarSheet } from '@/src/components/shared/DatePicker'
import { CalendarBlank, Check, CheckSquare, PencilSimple } from '@/src/components/shared/icons'
import { Chip } from '@/src/components/ui/Chip'
import { useUpdateCategory } from '@/src/hooks/useCategories'
import { useOnline } from '@/src/lib/netStatus'
import { toLocalDateString, todayLocal } from '@/src/lib/date'
import { addTodo, dayLabel, goalFit, insertAt, noteDate, parseNote, toggleLine, type Segment } from '@/src/lib/noteRender'
import { tap } from '@/src/lib/haptics'
import type { CategoryRow } from '@/src/types'

export const NOTE_MAX = 2000
const COUNTER_FROM = 1800
const SAVE_FAILED = "Couldn't save. Check your connection and try again."
// The success check's draw-on, then the sheet closes (CLAUDE.md's ~1100ms).
const SUCCESS_MS = 1100

/**
 * Drafts a dismissed sheet couldn't save, by category, so reopening it picks up
 * where you left off. ponytail: memory only, so a kill loses them; persist if that bites.
 */
export const keptDrafts = new Map<string, string>()

function placeholderFor(row: CategoryRow): string {
  if (row.goal || /sav|goal|fund|invest/i.test(row.group)) return "What's it for? Break it down"
  if (/bill|utilit|rent|emi|loan|insur|subscri/i.test(`${row.group} ${row.name}`)) return 'Due date, account no., autopay?'
  return 'What this covers, reminders, anything useful'
}

function Piece({ s }: { s: Segment }) {
  const { tokens } = useTheme()
  switch (s.kind) {
    case 'date':
      return (
        <Text style={{ color: s.days < 0 ? tokens.warnInk : tokens.accentInk, backgroundColor: s.days < 0 ? tokens.warnSoft : tokens.accentSoft, fontFamily: fontFamily.bodySemiBold }}>
          {` ${s.text} · ${dayLabel(s.days)} `}
        </Text>
      )
    case 'amount':
      return <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyBold }}>{s.text}</Text>
    case 'url':
    case 'phone':
      return (
        <Text accessibilityRole="link" onPress={() => Linking.openURL(s.href).catch(() => {})} style={{ color: tokens.accent, textDecorationLine: 'underline' }}>
          {s.text}
        </Text>
      )
    default:
      return <>{s.text}</>
  }
}

/**
 * An envelope's note, inside its sheet. Read view when there's one, "Add a note"
 * when there isn't; a tap edits it. `pending` hands the sheet an unsaved draft
 * on dismiss, so closing mid-edit still saves. `onSaved` runs once Save's check
 * has drawn, to close the sheet.
 */
export function NoteBlock({ row, readOnly, pending, onSaved, onEditingChange }: {
  row: CategoryRow
  readOnly: boolean
  pending: MutableRefObject<(() => string | undefined) | null>
  onSaved: () => void
  onEditingChange?: (editing: boolean) => void
}) {
  const { tokens } = useTheme()
  const { formatCurrency, formatCompact, currencySymbol } = useCurrency()
  const online = useOnline()
  const update = useUpdateCategory()
  const box = useRef<TextInput>(null)
  const caret = useRef(0)
  const caretAfter = useRef<number | null>(null)
  const kept = keptDrafts.get(row.name)
  const [note, setNote] = useState(row.note ?? '')
  const [editing, setEditing] = useState(kept !== undefined && !readOnly)
  const [draft, setDraft] = useState(kept ?? row.note ?? '')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [ticking, setTicking] = useState(false)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const busy = saving || success
  const today = todayLocal()
  const dirty = draft.trim() !== note.trim()

  useEffect(() => onEditingChange?.(editing), [editing, onEditingChange])
  // Read on dismiss: what's typed and not saved yet, if anything.
  useEffect(() => {
    pending.current = () => (editing && !busy && dirty ? draft : undefined)
  }, [pending, editing, busy, dirty, draft])
  useEffect(() => () => {
    pending.current = null
  }, [pending])

  useEffect(() => {
    if (!success) return
    const t = setTimeout(onSaved, SUCCESS_MS)
    return () => clearTimeout(t)
  }, [success, onSaved])

  // After a chip writes into the box, put the caret just past what it wrote.
  useEffect(() => {
    if (caretAfter.current === null) return
    const at = caretAfter.current
    caretAfter.current = null
    caret.current = at
    box.current?.focus()
    box.current?.setSelection?.(at, at)
  }, [draft])

  if (readOnly && !note) return null

  function edit() {
    if (readOnly || ticking) return
    tap()
    setDraft(note)
    setError('')
    setEditing(true)
  }

  function cancel() {
    keptDrafts.delete(row.name)
    setDraft(note)
    setError('')
    setEditing(false)
  }

  async function save() {
    if (busy || !online) return
    setSaving(true)
    setError('')
    try {
      // Blank clears it: the server trims and stores null.
      await update.mutateAsync({ name: row.name, updates: { note: draft.trim() || null } })
      keptDrafts.delete(row.name)
      setSuccess(true)
    } catch {
      setError(SAVE_FAILED)
    } finally {
      setSaving(false)
    }
  }

  async function tick(index: number) {
    if (ticking || readOnly) return
    tap()
    const before = note
    const next = toggleLine(note, index)
    setNote(next)
    setTicking(true)
    setError('')
    try {
      await update.mutateAsync({ name: row.name, updates: { note: next } })
    } catch {
      setNote(before)
      setError(SAVE_FAILED)
    } finally {
      setTicking(false)
    }
  }

  function apply(next: { text: string; caret: number } | null) {
    if (!next || busy) return
    caretAfter.current = next.caret
    setDraft(next.text)
  }

  if (!editing) {
    if (!note) {
      return (
        <Pressable accessibilityRole="button" onPress={edit} style={[styles.add, { backgroundColor: tokens.inputBg }]}>
          <PencilSimple size={15} color={tokens.text2} />
          <Text style={[styles.addText, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>Add a note</Text>
        </Pressable>
      )
    }
    const fit = row.goal ? goalFit(note, row.goal.amount, today) : null
    return (
      <View style={styles.block}>
        <Pressable
          testID="note-read"
          accessibilityHint={readOnly ? undefined : 'Edits the note'}
          disabled={readOnly || ticking}
          onPress={edit}
          style={[styles.read, { backgroundColor: tokens.inputBg }]}
        >
          {parseNote(note, today).map((line, i) => {
            const text = (
              <Text style={[styles.line, { color: line.check ? tokens.text3 : tokens.text, fontFamily: fontFamily.bodyMedium }, line.check && styles.done]}>
                {line.segments.map((s, j) => <Piece key={j} s={s} />)}
                {!line.segments.length && ' '}
              </Text>
            )
            if (line.check === undefined) return <View key={i}>{text}</View>
            return (
              <Pressable
                key={i}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: line.check, disabled: readOnly || ticking }}
                disabled={readOnly || ticking}
                onPress={() => void tick(i)}
                hitSlop={4}
                style={styles.check}
              >
                <View style={[styles.box, { borderColor: line.check ? tokens.accent : tokens.borderStrong, backgroundColor: line.check ? tokens.accent : 'transparent' }]}>
                  {line.check && <Check size={11} weight="bold" color={tokens.onAccent} />}
                </View>
                <View style={{ flex: 1 }}>{text}</View>
              </Pressable>
            )
          })}
          {fit && (
            <Text style={[styles.sum, { color: fit.diff === 0 ? tokens.pillGood : tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
              = {formatCurrency(fit.sum)} · {fit.diff === 0 ? 'matches your goal' : `${formatCompact(Math.abs(fit.diff))} ${fit.diff < 0 ? 'short of' : 'over'} your goal`}
            </Text>
          )}
        </Pressable>
        {!readOnly && (
          <Pressable accessibilityRole="button" onPress={edit} disabled={ticking} hitSlop={8} style={styles.editLink}>
            <Text style={[styles.hint, { color: tokens.accent, fontFamily: fontFamily.bodySemiBold }]}>Edit note</Text>
          </Pressable>
        )}
        {error !== '' && <Text accessibilityRole="alert" style={[styles.hint, { color: tokens.coral, fontFamily: fontFamily.bodySemiBold }]}>{error}</Text>}
      </View>
    )
  }

  const canSave = online && dirty && !saving
  return (
    <View style={styles.block}>
      <TextInput
        ref={box}
        testID="note-input"
        accessibilityLabel="Note"
        style={[styles.input, { backgroundColor: tokens.inputBg, borderColor: tokens.borderStrong, color: tokens.text, fontFamily: fontFamily.bodyMedium }]}
        value={draft}
        onChangeText={setDraft}
        onSelectionChange={(e) => (caret.current = e.nativeEvent.selection.start)}
        placeholder={placeholderFor(row)}
        placeholderTextColor={tokens.text3}
        multiline
        autoFocus
        editable={!busy}
        maxLength={NOTE_MAX}
        textAlignVertical="top"
      />
      {draft.length >= COUNTER_FROM && (
        <Text style={[styles.counter, { color: draft.length >= NOTE_MAX ? tokens.coral : tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>
          {draft.length}/{NOTE_MAX}
        </Text>
      )}
      <View style={styles.chips}>
        <Chip label="Add to-do" icon={(c) => <CheckSquare size={14} color={c} />} onPress={() => apply(addTodo(draft, caret.current, NOTE_MAX))} />
        <Chip label="Date" icon={(c) => <CalendarBlank size={14} color={c} />} onPress={() => !busy && setPicking(true)} />
        <Chip label="Amount" icon={(c) => <Text style={{ color: c, fontFamily: fontFamily.bodyBold }}>{currencySymbol}</Text>} onPress={() => apply(insertAt(draft, caret.current, currencySymbol, NOTE_MAX))} />
      </View>
      <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>
        {online ? 'Only people in this budget can see it.' : "You're offline. Save once you're back."}
      </Text>
      {error !== '' && <Text accessibilityRole="alert" style={[styles.hint, { color: tokens.coral, fontFamily: fontFamily.bodySemiBold }]}>{error}</Text>}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={cancel} disabled={busy} style={[styles.btn, { backgroundColor: tokens.pillBg }]}>
          <Text style={{ color: tokens.text, fontFamily: fontFamily.bodyBold }}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save note"
          accessibilityState={{ disabled: !canSave && !success }}
          onPress={() => void save()}
          disabled={!canSave || success}
          style={[styles.btn, styles.saveBtn, { backgroundColor: success ? tokens.successBg : canSave ? tokens.accent : tokens.inputBg, opacity: saving ? 0.6 : 1 }]}
        >
          {success ? (
            <CheckIcon color={tokens.onSuccess} />
          ) : (
            <Text style={{ color: canSave ? tokens.onAccent : tokens.text3, fontFamily: fontFamily.bodyBold }}>{saving ? 'Saving…' : 'Save note'}</Text>
          )}
        </Pressable>
      </View>
      <CalendarSheet
        visible={picking}
        disableFuture={false}
        onClose={() => setPicking(false)}
        onPick={(d) => apply(insertAt(draft, caret.current, noteDate(toLocalDateString(d), today), NOTE_MAX))}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  block: { gap: 8, marginBottom: 8 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8 },
  addText: { fontSize: 14 },
  read: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 4 },
  line: { fontSize: 14, lineHeight: 20 },
  done: { textDecorationLine: 'line-through' },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  sum: { fontSize: 13, marginTop: 4 },
  editLink: { alignSelf: 'flex-start' },
  hint: { fontSize: 12 },
  // Grows to a few lines, then scrolls inside itself, so Save stays in view with the keyboard up.
  input: { minHeight: 96, maxHeight: 180, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, lineHeight: 20 },
  counter: { fontSize: 12, alignSelf: 'flex-end', marginTop: -4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { flex: 2 },
})
