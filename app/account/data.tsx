import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  Linking,
  Share,
  StyleSheet,
} from "react-native";
import { Toggle } from "@/src/components/ui/Toggle";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  ArrowLeft,
  Trash2,
  CircleCheck,
  CircleAlert,
  Clock,
} from "lucide-react-native";
import { Alert } from "@/src/components/ui/AlertHost";
import { OfflineScreen } from "@/src/components/shared/OfflineScreen";
import { useOnline } from "@/src/lib/netStatus";
import { useTheme } from "@/src/theme/ThemeProvider";
import type { ThemeTokens } from "@/src/theme/tokens";
import { fontFamily } from "@/src/theme/fonts";
import { formatDateTime } from "@/src/lib/format";
import { Icon } from "@/src/components/shared/Icon";
import { LoadingPhrase } from "@/src/components/shared/LoadingPhrase";
import { useRefresh } from "@/src/hooks/useRefresh";
import { BottomSheet } from "@/src/components/shared/Modal";
import {
  clearTransactions,
  startExport,
  getExports,
  getExportDownloadUrl,
  type ExportRow,
} from "@/src/api/account";
import { isAnalyticsEnabled, setAnalyticsEnabled, track } from "@/src/lib/analytics";
import { listUnsynced, toCsv } from "@/src/lib/pendingExpenses";

function exportStatusMeta(status: ExportRow["status"], tokens: ThemeTokens) {
  switch (status) {
    case "ready":
      return {
        icon: CircleCheck,
        color: tokens.mint,
        soft: tokens.mintSoft,
        label: "Ready to download",
      };
    case "failed":
      return {
        icon: CircleAlert,
        color: tokens.coral,
        soft: tokens.coralSoft,
        label: "Failed. Tap for reason",
      };
    case "pending":
      return {
        icon: Clock,
        color: tokens.text2,
        soft: tokens.border,
        label: "Building…",
      };
  }
}

const DATA_LOADING_PHRASES = ["Loading your exports…", "Almost there…"];
const EXPORT_BUILDING_PHRASES = [
  "Packing your data…",
  "Tidying the columns…",
  "Almost ready…",
];

const exportsKey = ["exports"] as const;

// Same spring family EnvelopeGroup.tsx/envelopes.tsx use for list reflow.
const LIST_TRANSITION = LinearTransition.springify().damping(90).stiffness(900);

function ExportRowIcon({
  status,
  color,
  soft,
  icon,
}: {
  status: ExportRow["status"];
  color: string;
  soft: string;
  icon: typeof Clock;
}) {
  const pulse = useAnimatedStyle(() => ({
    opacity:
      status === "pending"
        ? withRepeat(withTiming(0.4, { duration: 700 }), -1, true)
        : 1,
  }));
  return (
    <Animated.View
      key={status}
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(120)}
      style={[styles.exportHistoryIcon, { backgroundColor: soft }, pulse]}
    >
      <Icon icon={icon} size={16} color={color} />
    </Animated.View>
  );
}

export default function DataScreen() {
  const { tokens } = useTheme();
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { refreshing, onRefresh } = useRefresh();
  const exportsQuery = useQuery({
    queryKey: exportsKey,
    queryFn: getExports,
    // Poll only while something's still building — a push notification is the
    // real "it's done" signal, this just catches the screen up if it's open.
    refetchInterval: (query) =>
      query.state.data?.exports.some((e) => e.status === "pending")
        ? 4000
        : false,
  });

  // Logged on this device but never reached the server, so the export above
  // cannot contain them. Shared as CSV straight from the device instead.
  const unsyncedQuery = useQuery({
    queryKey: ["unsynced-expenses"],
    queryFn: listUnsynced,
  });
  const unsynced = unsyncedQuery.data ?? [];
  const shareUnsynced = () =>
    void Share.share({ title: "Unsynced expenses", message: toCsv(unsynced) });
  const [starting, setStarting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [analyticsOn, setAnalyticsOn] = useState(isAnalyticsEnabled);

  const handleToggleAnalytics = (value: boolean) => {
    setAnalyticsOn(value);
    void setAnalyticsEnabled(value);
  };

  const exportsData = exportsQuery.data;
  // Asked of the server rather than counted here: the monthly cap can be
  // spent and an export still allowed, so an expired account can take its
  // data with it. An older server omits the field, which reads as "allowed" —
  // the POST's 429 is the real gate either way.
  const atLimit = exportsData
    ? exportsData.canExport === false
    : false;
  const pending =
    exportsData?.exports.some((e) => e.status === "pending") ?? false;

  const handleStartExport = async () => {
    setStarting(true);
    try {
      await startExport();
      track("data_exported");
    } catch (err) {
      if (err instanceof Error && err.message === "quota_exceeded") {
        const limit = exportsData?.limit;
        Alert.alert(
          limit
            ? `You've used all ${limit} exports this month`
            : "You've used your export limit this month",
          "Resets next month.",
        );
      } else {
        Alert.alert("Export failed", "Check your connection and try again.");
      }
    } finally {
      setStarting(false);
      void qc.invalidateQueries({ queryKey: exportsKey });
    }
  };

  const handleExportRowPress = async (row: ExportRow) => {
    if (row.status === "ready") {
      try {
        const url = await getExportDownloadUrl(row.id);
        void Linking.openURL(url);
      } catch {
        Alert.alert(
          "Couldn't open export",
          "Check your connection and try again.",
        );
      }
    } else if (row.status === "failed") {
      setFailureReason(
        "Something went wrong building your export. Give it another try.",
      );
    }
  };

  const doClear = async () => {
    setClearing(true);
    try {
      await clearTransactions();
      qc.invalidateQueries();
      setConfirmingClear(false);
    } catch {
      Alert.alert(
        "Could not clear transactions",
        "Check your connection and try again.",
      );
    } finally {
      setClearing(false);
    }
  };

  if (!online) return <OfflineScreen />;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: tokens.bg, paddingTop: insets.top },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={[
            styles.backButton,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <Text
          style={[
            styles.headerTitle,
            { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
          ]}
        >
          Your data
        </Text>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
      >
        <View
          style={[
            styles.card,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <Text
            style={[
              styles.cardTitle,
              { color: tokens.text, fontFamily: fontFamily.bodyExtraBold },
            ]}
          >
            Export
          </Text>
          {exportsData ? (
            <Text
              style={[
                styles.cardMeta,
                { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
              ]}
            >
              {Math.min(exportsData.usedThisMonth, exportsData.limit)} of{" "}
              {exportsData.limit} exports used this month
            </Text>
          ) : null}
          <View style={styles.exportRow}>
            <Pressable
              onPress={handleStartExport}
              disabled={starting || pending || atLimit}
              style={[
                styles.exportButton,
                {
                  borderColor: tokens.borderStrong,
                  backgroundColor: tokens.inputBg,
                },
              ]}
            >
              {starting || pending ? (
                <View style={styles.exportButtonPhraseWrap}>
                  <LoadingPhrase
                    phrases={EXPORT_BUILDING_PHRASES}
                    color={tokens.text}
                    style={[
                      styles.exportButtonText,
                      {
                        fontFamily: fontFamily.bodyBold,
                        textAlign: "center",
                        color: tokens.text2,
                      },
                    ]}
                  />
                </View>
              ) : (
                <Text
                  style={[
                    styles.exportButtonText,
                    { color: tokens.text, fontFamily: fontFamily.bodyBold },
                  ]}
                >
                  Export
                </Text>
              )}
            </Pressable>
          </View>
          {atLimit && !exportsData?.accessExpired ? (
            <Text
              style={[
                styles.cardMeta,
                styles.exportLimitMessage,
                { color: tokens.coral, fontFamily: fontFamily.bodyMedium },
              ]}
            >
              You&apos;ve used all {exportsData?.limit} exports this month.
              Resets next month.
            </Text>
          ) : null}
          {exportsData?.exitExport ? (
            <Text
              style={[
                styles.cardMeta,
                { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
              ]}
            >
              Your subscription is inactive. This is your final export, so it
              doesn&apos;t count against the monthly limit.
            </Text>
          ) : null}
          {pending ? (
            <Text
              style={[
                styles.cardMeta,
                { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
              ]}
            >
              Processing. This can take a minute, we&apos;ll notify you when
              it&apos;s ready.
            </Text>
          ) : null}
          {exportsQuery.isLoading ? (
            <View style={{ marginVertical: 20 }}>
              <LoadingPhrase
                phrases={DATA_LOADING_PHRASES}
                color={tokens.text2}
                style={[styles.cardMeta, { fontFamily: fontFamily.bodyMedium }]}
              />
            </View>
          ) : null}
          {exportsData && exportsData.exports.length > 0 ? (
            <Animated.View
              layout={LIST_TRANSITION}
              style={{ marginTop: 12, gap: 4 }}
            >
              {exportsData.exports.map((row, i) => {
                const meta = exportStatusMeta(row.status, tokens);
                const isLast = i === exportsData.exports.length - 1;
                return (
                  <Animated.View
                    key={row.id}
                    entering={FadeIn.duration(150)}
                    layout={LIST_TRANSITION}
                  >
                    <Pressable
                      onPress={() => void handleExportRowPress(row)}
                      disabled={row.status === "pending"}
                      style={styles.exportHistoryRow}
                    >
                      <View style={styles.exportHistoryIconCol}>
                        <ExportRowIcon
                          status={row.status}
                          color={meta.color}
                          soft={meta.soft}
                          icon={meta.icon}
                        />
                        {!isLast ? (
                          <View
                            style={[
                              styles.exportHistoryLine,
                              { backgroundColor: tokens.border },
                            ]}
                          />
                        ) : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.exportHistoryDate,
                            {
                              color: tokens.text,
                              fontFamily: fontFamily.bodyMedium,
                            },
                          ]}
                        >
                          {formatDateTime(row.created_at)}
                        </Text>
                        <Animated.Text
                          key={row.status}
                          entering={FadeIn.duration(150)}
                          exiting={FadeOut.duration(120)}
                          style={[
                            styles.exportHistoryStatus,
                            {
                              color: meta.color,
                              fontFamily: fontFamily.bodyMedium,
                            },
                          ]}
                        >
                          {meta.label}
                        </Animated.Text>
                      </View>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </Animated.View>
          ) : null}
        </View>

        {unsynced.length > 0 ? (
          <View
            style={[
              styles.card,
              { backgroundColor: tokens.card, borderColor: tokens.border },
            ]}
          >
            <Text
              style={[
                styles.cardTitle,
                { color: tokens.text, fontFamily: fontFamily.bodyExtraBold },
              ]}
            >
              Not synced yet
            </Text>
            <Text
              style={[
                styles.cardMeta,
                { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
              ]}
            >
              {unsynced.length === 1
                ? "1 expense on this phone hasn't reached your account, so it isn't in the export."
                : `${unsynced.length} expenses on this phone haven't reached your account, so they aren't in the export.`}
            </Text>
            <View style={styles.exportRow}>
              <Pressable
                onPress={shareUnsynced}
                style={[
                  styles.exportButton,
                  {
                    borderColor: tokens.borderStrong,
                    backgroundColor: tokens.inputBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.exportButtonText,
                    { color: tokens.text, fontFamily: fontFamily.bodyBold },
                  ]}
                >
                  Share as CSV
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.card,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <Text
            style={[
              styles.cardTitle,
              { color: tokens.text, fontFamily: fontFamily.bodyExtraBold },
            ]}
          >
            Privacy
          </Text>
          <View style={styles.analyticsRow}>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.analyticsLabel,
                  { color: tokens.text, fontFamily: fontFamily.bodySemiBold },
                ]}
              >
                Share usage analytics
              </Text>
              <Text
                style={[
                  styles.cardMeta,
                  { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
                ]}
              >
                Your name, email, and which features you use, sent to
                PostHog. Never your amounts or item names.
              </Text>
            </View>
            <Toggle
              value={analyticsOn}
              onValueChange={handleToggleAnalytics}
            />
          </View>
        </View>

        <Pressable
          onPress={() => setConfirmingClear(true)}
          disabled={clearing}
          style={[
            styles.clearRow,
            { borderColor: tokens.borderStrong, opacity: clearing ? 0.6 : 1 },
          ]}
        >
          <Icon icon={Trash2} size={16} color={tokens.coral} />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.clearTitle,
                { color: tokens.coral, fontFamily: fontFamily.bodyBold },
              ]}
            >
              {clearing ? "Clearing…" : "Clear all transactions"}
            </Text>
            <Text style={[styles.clearHint, { color: tokens.text2 }]}>
              Keeps envelopes, wipes history
            </Text>
          </View>
        </Pressable>
      </ScrollView>

      <BottomSheet
        visible={confirmingClear}
        onClose={() => !clearing && setConfirmingClear(false)}
      >
        <Text
          style={[
            styles.sheetTitle,
            { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
          ]}
        >
          Clear all transactions
        </Text>
        <Text
          style={[
            styles.sheetBody,
            { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
          ]}
        >
          Deletes every transaction. Your envelopes and their assigned amounts
          stay. This can&apos;t be undone.
        </Text>
        <View style={styles.sheetButtonRow}>
          <Pressable
            onPress={() => setConfirmingClear(false)}
            disabled={clearing}
            style={[styles.sheetCancelButton, { opacity: clearing ? 0.5 : 1 }]}
          >
            <Text
              style={[
                styles.sheetCancelText,
                { color: tokens.text2, fontFamily: fontFamily.bodyBold },
              ]}
            >
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={doClear}
            disabled={clearing}
            style={[
              styles.sheetSaveButton,
              styles.sheetDeleteButton,
              { backgroundColor: tokens.coral, opacity: clearing ? 0.6 : 1 },
            ]}
          >
            <Text
              style={[
                styles.sheetSaveText,
                { color: tokens.onAccent, fontFamily: fontFamily.bodyBold },
              ]}
            >
              {clearing ? "Clearing…" : "Clear"}
            </Text>
          </Pressable>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={failureReason !== null}
        onClose={() => setFailureReason(null)}
      >
        <Text
          style={[
            styles.sheetTitle,
            { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
          ]}
        >
          Export failed
        </Text>
        <Text
          style={[
            styles.sheetBody,
            { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
          ]}
        >
          {failureReason}
        </Text>
        <Pressable
          onPress={() => setFailureReason(null)}
          style={[
            styles.sheetSaveButton,
            {
              backgroundColor: tokens.inputBg,
              borderWidth: 1,
              borderColor: tokens.borderStrong,
            },
          ]}
        >
          <Text
            style={[
              styles.sheetSaveText,
              { color: tokens.text, fontFamily: fontFamily.bodyBold },
            ]}
          >
            OK
          </Text>
        </Pressable>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 19 },
  scrollContent: { padding: 16, gap: 12 },
  card: { padding: 16, borderWidth: 1, borderRadius: 20 },
  cardTitle: { fontSize: 14 },
  cardMeta: { fontSize: 12, marginTop: 4 },
  exportLimitMessage: { marginTop: 8 },
  exportRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  exportButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 100,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  exportButtonText: { fontSize: 13 },
  exportButtonPhraseWrap: { alignSelf: "stretch" },
  exportHistoryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 6,
  },
  exportHistoryIconCol: { width: 28, alignItems: "center" },
  exportHistoryIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  exportHistoryLine: {
    position: "absolute",
    top: 27.75,
    height: 24.5,
    width: 2,
    borderRadius: 1,
  },
  exportHistoryDate: { fontSize: 13 },
  exportHistoryStatus: { fontSize: 11, marginTop: 1 },
  clearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderRadius: 20,
  },
  clearTitle: { fontSize: 14 },
  clearHint: { fontSize: 11, marginTop: 2 },
  analyticsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  analyticsLabel: { fontSize: 14, marginBottom: 2 },
  sheetTitle: { fontSize: 18, marginBottom: 12 },
  sheetBody: { fontSize: 13, lineHeight: 18 },
  sheetSaveButton: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetSaveText: { fontSize: 14 },
  sheetButtonRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  sheetDeleteButton: { flex: 1, marginTop: 0 },
  sheetCancelButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCancelText: { fontSize: 14 },
});
