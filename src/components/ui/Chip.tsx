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
import { tap } from "@/src/lib/haptics";
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
 *
 * `soft` swaps the solid accent selection for an accentSoft tint, for filter
 * rows that sit next to a primary CTA and shouldn't compete with it.
 */
export function Chip({
  icon,
  label,
  selected,
  onPress,
  onAccent,
  soft,
  haptic = true,
  style,
}: {
  /** An emoji, or a render function handed the chip's current text colour. */
  icon?: string | ((color: string) => ReactNode);
  label: string;
  selected?: boolean;
  onPress: () => void;
  onAccent?: boolean;
  soft?: boolean;
  /** Off when onPress plays its own feedback (a ripple), so the two don't stack. */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens, radius, space, type } = useTheme();
  const press = usePressSpring(0.94);

  const bg = onAccent
    ? selected
      ? tokens.accent
      : "rgba(255, 255, 255, 0.18)"
    : selected
      ? soft
        ? tokens.accentSoft
        : tokens.accent
      : tokens.pillBg;
  const fg = onAccent
    ? selected
      ? tokens.accentInk
      : tokens.onAccent
    : selected
      ? soft
        ? tokens.accentInk
        : tokens.onAccent
      : tokens.text2;
  const border = onAccent
    ? "transparent"
    : selected
      ? soft
        ? tokens.accentInk
        : tokens.accent
      : tokens.border;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        if (haptic) tap();
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
