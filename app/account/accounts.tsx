import { useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Plus } from "lucide-react-native";
import Reanimated from "react-native-reanimated";
import { OfflineScreen } from "@/src/components/shared/OfflineScreen";
import { useOnline } from "@/src/lib/netStatus";
import { useTheme } from "@/src/theme/ThemeProvider";
import { fontFamily } from "@/src/theme/fonts";
import { Icon } from "@/src/components/shared/Icon";
import { LoadingPhrase } from "@/src/components/shared/LoadingPhrase";
import { PopIn } from "@/src/components/shared/PopIn";
import { CheckIcon } from "@/src/components/shared/CheckIcon";
import { usePressSpring } from "@/src/components/ui/Button";
import { Alert } from "@/src/components/ui/AlertHost";
import { ACCOUNT_TYPE_EMOJI } from "@/src/components/shared/AccountChips";
import { liveAccounts, useAccounts, useAddAccount, useUpdateAccount } from "@/src/hooks/useAccounts";
import { useBalanceStatus } from "@/src/hooks/useBalanceCheck";
import { useRefresh } from "@/src/hooks/useRefresh";
import { ACCOUNT_TYPE_LABEL, accountErrorMessage } from "@/src/lib/accounts";
import type { AccountRow, AccountType } from "@/src/types";

const LOADING_PHRASES = ["Finding your accounts…", "Counting wallets…", "Almost there…"];
const MOUNT_DELAY = 100;
const ITEM_STAGGER = 45;
const STAGGER_CAP = 6;

/**
 * Name where money lives so each expense can say which one it came from.
 * Labels only: no balances here, the weekly balance check covers that.
 * Twin of Web's src/views/AccountsPage.tsx.
 */
export default function AccountsScreen() {
  const { tokens } = useTheme();
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshing, onRefresh } = useRefresh();
  const accountsQ = useAccounts();
  const update = useUpdateAccount();
  const all = accountsQ.data ?? [];
  const live = liveAccounts(all);
  const archived = all.filter((a) => a.archived);

  if (!online) return <OfflineScreen />;

  function restore(a: AccountRow) {
    update.mutate(
      { id: a.id, updates: { archived: false } },
      { onError: (err) => Alert.alert("Couldn't restore this", accountErrorMessage(err)) },
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back" style={[styles.backButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Icon icon={ArrowLeft} size={20} color={tokens.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Accounts</Text>
          <Text style={[styles.headerSub, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
            {live.length === 0 ? "Where your money lives" : `${live.length} in use`}
          </Text>
        </View>
        <Pressable onPress={() => router.push("/modals/account")} accessibilityRole="button" style={[styles.addButton, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <Icon icon={Plus} size={16} color={tokens.text} />
          <Text style={[styles.addText, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Add</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={accountsQ.isLoading ? styles.centered : styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />}
      >
        {accountsQ.isLoading ? (
          <LoadingPhrase phrases={LOADING_PHRASES} color={tokens.text2} style={[styles.loadingPhrase, { fontFamily: fontFamily.bodyMedium }]} />
        ) : live.length === 0 && archived.length === 0 ? (
          <StarterAccounts />
        ) : (
          <>
            <View style={{ gap: 10 }}>
              {live.map((a, i) => (
                <AccountItem key={a.id} account={a} index={i} onPress={() => router.push(`/modals/account?id=${encodeURIComponent(a.id)}`)} />
              ))}
            </View>
            <Text style={[styles.hint, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
              Pick one when you log an expense. Your weekly balance check asks about each bank account.
            </Text>
            {archived.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>ARCHIVED</Text>
                {archived.map((a) => (
                  <View key={a.id} style={[styles.rowCard, styles.rowInner, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
                    <Text style={[styles.emoji, { opacity: 0.5 }]}>{ACCOUNT_TYPE_EMOJI[a.type] ?? "🏦"}</Text>
                    <Text style={[styles.rowTitle, { flex: 1, color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>{a.name}</Text>
                    <Pressable onPress={() => restore(a)} disabled={update.isPending} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Restore ${a.name}`}>
                      <Text style={[styles.restore, { color: tokens.mint, fontFamily: fontFamily.bodyBold }]}>Restore</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function AccountItem({ account, index, onPress }: { account: AccountRow; index: number; onPress: () => void }) {
  const { tokens } = useTheme();
  const press = usePressSpring(0.98);
  return (
    <PopIn play delay={MOUNT_DELAY + Math.min(index, STAGGER_CAP) * ITEM_STAGGER} style={[styles.rowCard, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
      <Reanimated.View style={press.style}>
        <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={`Edit ${account.name}`} style={styles.rowInner}>
          <Text style={styles.emoji}>{ACCOUNT_TYPE_EMOJI[account.type] ?? "🏦"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]} numberOfLines={1}>{account.name}</Text>
            <Text style={[styles.rowMeta, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>{ACCOUNT_TYPE_LABEL[account.type] ?? "Account"}</Text>
          </View>
        </Pressable>
      </Reanimated.View>
    </PopIn>
  );
}

/**
 * First visit: offer the names already typed into the balance check, plus
 * cash and a card, so setting up is one tap. Seeded once, so it waits for
 * those names to arrive.
 */
function StarterAccounts() {
  const balance = useBalanceStatus();
  const { tokens } = useTheme();
  if (balance.isLoading) return <LoadingPhrase phrases={LOADING_PHRASES} color={tokens.text2} style={[styles.loadingPhrase, { fontFamily: fontFamily.bodyMedium }]} />;
  return <StarterPicks names={balance.data?.accounts ?? []} />;
}

function StarterPicks({ names }: { names: string[] }) {
  const { tokens } = useTheme();
  const add = useAddAccount();
  const base = names.length > 0 ? names.map((name) => ({ name, type: "bank" as AccountType, picked: true })) : [{ name: "Bank", type: "bank" as AccountType, picked: true }];
  const [choices, setChoices] = useState(() => [
    ...base,
    { name: "Cash", type: "cash" as AccountType, picked: true },
    { name: "Credit card", type: "credit_card" as AccountType, picked: false },
  ]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const picked = choices.filter((c) => c.picked);

  async function addAll() {
    if (picked.length === 0 || saving) return;
    setSaving(true);
    try {
      // One at a time, so a duplicate stops the rest instead of racing them.
      for (const c of picked) await add.mutateAsync({ name: c.name, type: c.type });
      setDone(true);
    } catch (err) {
      Alert.alert("Couldn't add these", accountErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.starter, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
      <Text style={[styles.starterTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Start with these?</Text>
      <Text style={[styles.starterBody, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
        Name where your money lives. Then each expense can say which one it came from.
      </Text>
      <View style={styles.chipRow}>
        {choices.map((c, i) => (
          <Pressable
            key={`${c.type}:${c.name}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: c.picked }}
            accessibilityLabel={c.name}
            onPress={() => setChoices((all) => all.map((x, j) => (j === i ? { ...x, picked: !x.picked } : x)))}
            style={[styles.chip, { backgroundColor: c.picked ? tokens.accent : tokens.pillBg, borderColor: c.picked ? tokens.accent : tokens.border }]}
          >
            <Text style={[styles.chipText, { color: c.picked ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
              {ACCOUNT_TYPE_EMOJI[c.type]} {c.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={addAll}
        disabled={picked.length === 0 || saving || done}
        accessibilityRole="button"
        style={[styles.primary, { backgroundColor: done ? tokens.mint : tokens.accent, opacity: picked.length === 0 || saving ? 0.5 : 1 }]}
      >
        {done ? (
          <CheckIcon color={tokens.onAccent} />
        ) : (
          <Text style={[styles.primaryText, { color: tokens.onAccent, fontFamily: fontFamily.bodyBold }]}>
            {saving ? "Adding…" : picked.length === 0 ? "Pick at least one" : `Add ${picked.length === 1 ? "it" : `these ${picked.length}`}`}
          </Text>
        )}
      </Pressable>
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
    paddingTop: 14,
    paddingBottom: 10,
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
  headerSub: { fontSize: 11.5, marginTop: 1 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
  },
  addText: { fontSize: 12.5 },
  body: { padding: 16, gap: 16 },
  heroBlock: { gap: 4 },
  heroLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  allocationCard: { borderWidth: 1, borderRadius: 16, padding: 16 },
  discoveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  discoveryIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  discoveryText: { flex: 1, fontSize: 14 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.6 },
  rowCard: { borderWidth: 1, borderRadius: 14 },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  emoji: { fontSize: 20 },
  headerButtons: { flexDirection: "row", gap: 8 },
  starter: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10, width: "100%" },
  starterTitle: { fontSize: 16 },
  starterBody: { fontSize: 13, lineHeight: 18 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13 },
  primary: { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  primaryText: { fontSize: 15 },
  hint: { fontSize: 12, lineHeight: 16 },
  restore: { fontSize: 13 },
  sheetTitle: { fontSize: 18, marginBottom: 12 },
  sheetBody: { fontSize: 13, lineHeight: 18 },
  sheetButtonRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  sheetButton: { flex: 1, minHeight: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  sheetButtonText: { fontSize: 14 },
  rowTitle: { fontSize: 15 },
  rowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  pill: {
    height: 16,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pillText: { fontSize: 11, lineHeight: 13 },
  rowMeta: { fontSize: 12, flexShrink: 1 },
  rowAmount: { fontSize: 15 },
  // Fills the space under the header so the loading phrase and the empty state
  // both sit in the middle of the screen rather than tucked under the header.
  centered: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    marginTop: -72,
  },
  // The phrase spans the full width, so it centers with textAlign rather than
  // by the container's alignItems.
  loadingPhrase: { fontSize: 13, lineHeight: 19, textAlign: "center" },
});
