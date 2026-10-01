import { useCurrency } from '@/src/context/CurrencyContext'
// Dev iteration surface for the three widget layouts — renders the same JSX
// WidgetSync pushes to the home screen, at real dp sizes, inside the app.
// WidgetPreview goes through the same tree builder as the RemoteViews the
// launcher actually shows, but it isn't RemoteViews itself — translucency
// over a real wallpaper and border-radius clipping can still differ, so
// verify a layout change here first, then confirm once via More > "Add
// widget to home screen" before calling it done.
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { WidgetPreview } from "react-native-android-widget";
import { useTheme } from "@/src/theme/ThemeProvider";
import { fontFamily } from "@/src/theme/fonts";
import { useBudgets } from "@/src/hooks/useBudgets";
import { useRecentExpenses } from "@/src/hooks/useExpenses";
import { useCategories } from "@/src/hooks/useCategories";
import { useGroups } from "@/src/hooks/useGroups";
import {
  computeEnvelopeState,
  currentMonthKey,
  daysLeftInMonth,
} from "@/src/lib/envelope";
import { todayLocal } from "@/src/lib/date";
import { toWidgetData } from "@/src/widgets/data";
import { EnvelopeWidget } from "@/src/widgets/EnvelopeWidget";
import { EnvelopeBarWidget } from "@/src/widgets/EnvelopeBarWidget";
import { EnvelopeMiniWidget } from "@/src/widgets/EnvelopeMiniWidget";

export default function WidgetPreviewScreen() {
  const { currencyCode } = useCurrency()

  const { tokens, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const budgetsQ = useBudgets();
  const expensesQ = useRecentExpenses();
  const categoriesQ = useCategories();
  const groupsQ = useGroups();

  const ready = budgetsQ.data && expensesQ.data;

  return (
    <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={20} color={tokens.text} />
        </Pressable>
        <Text
          style={[
            styles.title,
            { color: tokens.text, fontFamily: fontFamily.displayBold },
          ]}
        >
          Widget preview
        </Text>
      </View>
      {!ready ? null : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40 },
          ]}
        >
          {(() => {
            const state = computeEnvelopeState(
              budgetsQ.data!,
              expensesQ.data!,
              currentMonthKey(),
              categoriesQ.data ?? [],
              groupsQ.data ?? [],
            );
            const data = toWidgetData(
              state,
              expensesQ.data!,
              daysLeftInMonth(),
              todayLocal(),
              currencyCode,
            );
            return (
              <>
                <PreviewRow label="Aviary · 4x4">
                  <WidgetPreview
                    width={250}
                    height={250}
                    highlightClickableAreas
                    renderWidget={({ width, height }) => (
                      <EnvelopeWidget
                        {...data}
                        tokens={tokens}
                        scheme={scheme}
                        width={width}
                        height={height}
                      />
                    )}
                  />
                </PreviewRow>
                <PreviewRow label="Aviary · resized short">
                  <WidgetPreview
                    width={250}
                    height={170}
                    highlightClickableAreas
                    renderWidget={({ width, height }) => (
                      <EnvelopeWidget
                        {...data}
                        tokens={tokens}
                        scheme={scheme}
                        width={width}
                        height={height}
                      />
                    )}
                  />
                </PreviewRow>
                <PreviewRow label="Aviary Bar · 4x1">
                  <WidgetPreview
                    width={250}
                    height={72}
                    highlightClickableAreas
                    renderWidget={({ height }) => (
                      <EnvelopeBarWidget
                        {...data}
                        tokens={tokens}
                        scheme={scheme}
                        height={height}
                      />
                    )}
                  />
                </PreviewRow>
                <PreviewRow label="Aviary Bar · 4x1 floor">
                  <WidgetPreview
                    width={250}
                    height={40}
                    highlightClickableAreas
                    renderWidget={({ height }) => (
                      <EnvelopeBarWidget
                        {...data}
                        tokens={tokens}
                        scheme={scheme}
                        height={height}
                      />
                    )}
                  />
                </PreviewRow>
                <PreviewRow label="Aviary Mini · 2x2 cell">
                  {/* The cell the launcher hands out, not the card: the card
                      draws itself square inside it. */}
                  <WidgetPreview
                    width={131}
                    height={184}
                    highlightClickableAreas
                    renderWidget={({ width }) => (
                      <EnvelopeMiniWidget
                        {...data}
                        tokens={tokens}
                        scheme={scheme}
                        width={width}
                      />
                    )}
                  />
                </PreviewRow>
                <PreviewRow label="Aviary Mini · 2x2 floor">
                  <WidgetPreview
                    width={110}
                    height={140}
                    highlightClickableAreas
                    renderWidget={({ width }) => (
                      <EnvelopeMiniWidget
                        {...data}
                        tokens={tokens}
                        scheme={scheme}
                        width={width}
                      />
                    )}
                  />
                </PreviewRow>
              </>
            );
          })()}
        </ScrollView>
      )}
    </View>
  );
}

function PreviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <View style={styles.row}>
      <Text
        style={[
          styles.rowLabel,
          { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
        ]}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 18 },
  content: { paddingHorizontal: 20, gap: 24 },
  row: { gap: 8 },
  rowLabel: { fontSize: 12 },
});
