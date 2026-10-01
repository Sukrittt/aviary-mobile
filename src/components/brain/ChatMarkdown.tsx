import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { parseChatMarkdown, type Run } from '@/src/lib/chatMarkdown'

/** Renders an Ask Aviary answer: paragraphs, bullet/numbered lists, bold runs. */
export function ChatMarkdown({ text }: { text: string }) {
  const { tokens } = useTheme()
  const blocks = useMemo(() => parseChatMarkdown(text), [text])
  const base = { color: tokens.text, fontFamily: fontFamily.bodyMedium }

  const runs = (items: Run[]) =>
    items.map((run, i) =>
      run.bold ? (
        <Text key={i} style={{ fontFamily: fontFamily.bodyBold }}>
          {run.text}
        </Text>
      ) : (
        run.text
      ),
    )

  return (
    <View style={styles.wrap}>
      {blocks.map((block, i) => {
        if (block.type === 'p') {
          return (
            <Text key={i} style={[styles.text, base]}>
              {runs(block.runs)}
            </Text>
          )
        }
        return (
          <View key={i} style={styles.list}>
            {block.items.map((item, j) => (
              <View key={j} style={styles.item}>
                <Text style={[styles.text, styles.marker, base, { color: tokens.text2 }]}>
                  {block.type === 'ol' ? `${block.start + j}.` : '•'}
                </Text>
                <Text style={[styles.text, base, { flex: 1 }]}>{runs(item)}</Text>
              </View>
            ))}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  text: { fontSize: 14, lineHeight: 20 },
  list: { gap: 4 },
  item: { flexDirection: 'row', gap: 6 },
  marker: { minWidth: 14 },
})
