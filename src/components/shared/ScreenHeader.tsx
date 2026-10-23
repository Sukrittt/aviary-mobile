import { useTheme } from "@/src/theme/ThemeProvider";
import { fontFamily } from "@/src/theme/fonts";
import { ArrowLeft, X, type PhosphorIcon } from "@/src/components/shared/icons";
import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * The one header for pushed and modal screens: circular back (or close) on the
 * left, a left-aligned title with an optional subtitle, and an optional right
 * action. It owns the top safe-area inset, so screens must not pad their
 * container by `insets.top` as well.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  close = false,
  backLabel,
  backDisabled = false,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Omit for a screen with no way out (e.g. a locked plan screen). */
  onBack?: () => void;
  /** Show X instead of the back arrow, for modals that dismiss. */
  close?: boolean;
  backLabel?: string;
  backDisabled?: boolean;
  right?: ReactNode;
}) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 14, borderBottomColor: tokens.border }]}>
      {onBack && (
        <Pressable
          onPress={onBack}
          disabled={backDisabled}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={backLabel ?? (close ? "Close" : "Back")}
          style={[
            styles.back,
            { backgroundColor: tokens.card, borderColor: tokens.border, opacity: backDisabled ? 0.4 : 1 },
          ]}
        >
          {close ? <X size={18} color={tokens.text} /> : <ArrowLeft size={20} color={tokens.text} />}
        </Pressable>
      )}
      <View style={styles.titles}>
        {typeof title === "string" ? (
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.title, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}
          >
            {title}
          </Text>
        ) : (
          title
        )}
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[styles.subtitle, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

/** The pill for a header's right-side action ("Add", "Rename"…). */
export function HeaderButton({
  label,
  onPress,
  icon: IconCmp,
  primary = false,
  accessibilityLabel,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: PhosphorIcon;
  primary?: boolean;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const { tokens } = useTheme();
  const fg = primary ? tokens.onAccent : tokens.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.pill,
        {
          backgroundColor: primary ? tokens.accent : tokens.card,
          borderColor: primary ? tokens.accent : tokens.border,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {IconCmp && <IconCmp size={16} color={fg} />}
      <Text style={[styles.pillText, { color: fg, fontFamily: primary ? fontFamily.bodyBold : fontFamily.bodySemiBold }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titles: { flex: 1, minWidth: 0 },
  title: { fontSize: 19 },
  subtitle: { fontSize: 12, marginTop: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
  },
  pillText: { fontSize: 12.5 },
});
