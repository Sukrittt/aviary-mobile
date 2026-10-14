import type { ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/ThemeProvider";
import { fontFamily } from "@/src/theme/fonts";
import { usePressSpring } from "./Button";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Selectable pill. Covers the category rail, holding-type picker, billing-cycle
 * picker and the Activity period toggle — all of which hand-rolled the same shape.
 *
 * `onAccent` renders the chip for the flood screen, where the ground is `accent`
 * and the usual card/border colors would disappear into it.
 */
export function Chip({
  icon,
  label,
  selected,
  onPress,
  onAccent,
  style,
}: {
  /** An emoji, or a render function handed the chip's current text colour. */
  icon?: string | ((color: string) => ReactNode);
  label: string;
  selected?: boolean;
  onPress: () => void;
  onAccent?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens, radius, space, type } = useTheme();
  const press = usePressSpring(0.94);

  const bg = onAccent
    ? selected
      ? tokens.accent
      : "rgba(255, 255, 255, 0.18)"
    : selected
      ? tokens.accent
      : tokens.pillBg;
  const fg = onAccent
    ? selected
      ? tokens.accentInk
      : tokens.onAccent
    : selected
      ? tokens.onAccent
      : tokens.text2;
  const border = onAccent
    ? "transparent"
    : selected
      ? tokens.accent
      : tokens.border;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.chip,
        {
          backgroundColor: bg,
          borderColor: border,
          borderRadius: radius.full,
          paddingVertical: space.sm,
          paddingHorizontal: space.lg,
        },
        press.style,
        style,
      ]}
    >
      {typeof icon === "function" ? (
        <View style={{ marginRight: space.xs }}>{icon(fg)}</View>
      ) : icon ? (
        // Separate Text node, no custom fontFamily: a ZWJ+variation-selector emoji
        // (e.g. person + gender modifier) sharing one custom-font Text run with the
        // label can make Android silently drop the rest of that run.
        <Text style={{ color: fg, fontSize: type.caption, marginRight: space.xs }}>
          {icon}
        </Text>
      ) : null}
      <Text
        style={{
          color: fg,
          fontFamily: fontFamily.bodySemiBold,
          fontSize: type.caption,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", borderWidth: 1 },
});
