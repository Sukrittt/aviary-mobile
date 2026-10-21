import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/src/components/ui/AlertHost'
import { ImportFlow, appName } from '@/src/components/onboarding/ImportFlow'
import { importErrorCopy, pastImportLine } from '@/src/components/onboarding/importCopy'
import { getPastImports, ImportFailure, undoImport, type ImportHistoryItem } from '@/src/api/imports'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { track } from '@/src/lib/analytics'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'

const pastImportsKey = ['import-history'] as const

/**
 * Settings' "Import from another app": the onboarding import, opened on the
 * app list. Into a budget that's set up, the server makes it a later import
 * (history from before the first entry only). Past imports sit under the
 * app list, each one undoable. Web's src/views/ImportPage.tsx.
 */
export default function ImportScreen() {
  const { tokens } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { active } = useBudgetSpaces()
  // Home's banner carries the progress from here.
  const home = () => {
    void queryClient.invalidateQueries()
    router.dismissTo('/(tabs)')
  }
  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }]}>
      <ImportFlow skipAsk budgetName={active?.name} onFresh={() => router.back()} onDone={home} onAlreadySetUp={home}>
        <PastImports />
      </ImportFlow>
    </View>
  )
}

function PastImports() {
  const { tokens } = useTheme()
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: pastImportsKey, queryFn: getPastImports })
  const [undoing, setUndoing] = useState<string | null>(null)
  if (!data?.length) return null

  const undo = async (item: ImportHistoryItem) => {
    setUndoing(item.importId)
    try {
      await undoImport(item.importId)
      track('import_undone', { app: item.app, rows: item.total })
      void queryClient.invalidateQueries()
    } catch (err) {
      Alert.alert('Couldn’t undo that import', importErrorCopy(err instanceof ImportFailure ? err.code : 'network'))
    } finally {
      setUndoing(null)
    }
  }

  const confirm = (item: ImportHistoryItem) =>
    Alert.alert('Undo this import?', 'Everything it brought in goes to the Archive. Envelopes and accounts it made stay.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Undo import', style: 'destructive', onPress: () => void undo(item) },
    ])

  return (
    <View style={styles.past} accessibilityLabel="Your imports">
      <Text style={[styles.pastTitle, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>YOUR IMPORTS</Text>
      {data.map((item) => (
        <View key={item.importId} style={[styles.row, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Text style={[styles.rowText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{pastImportLine(appName(item.app), item.committedAt, item.total)}</Text>
          {item.status === 'importing' ? (
            <Text style={[styles.rowMeta, { color: tokens.text3, fontFamily: fontFamily.bodySemiBold }]}>Still bringing it in…</Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Undo import, ${pastImportLine(appName(item.app), item.committedAt, item.total)}`}
              disabled={undoing !== null}
              onPress={() => confirm(item)}
              hitSlop={8}
              style={[styles.undo, { backgroundColor: tokens.coralSoft, opacity: undoing === item.importId ? 0.5 : 1 }]}
            >
              <Text style={[styles.undoText, { color: tokens.coral, fontFamily: fontFamily.bodyBold }]}>{undoing === item.importId ? 'Undoing…' : 'Undo import'}</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 22 },
  past: { gap: 8, marginTop: 16 },
  pastTitle: { fontSize: 12, letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1 },
  rowText: { flex: 1, fontSize: 13, lineHeight: 18 },
  rowMeta: { fontSize: 12 },
  undo: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 100 },
  undoText: { fontSize: 12 },
})
