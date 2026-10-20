import { useEffect, useRef } from "react";
import { Dimensions, StyleSheet } from "react-native";
import Reanimated, { Easing, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { INCOME_FLOOD } from "@/src/theme/tokens";
import { IncomeForm } from "./add-income";
import { withReadOnlyGate } from "@/src/components/budgets/ReadOnlyNotice";

const EASE = Easing.bezier(0.4, 0, 0.2, 1);

/** One-off income on the green flood. Opens over the screen it came from with
 * no transition of its own: a green disc grows from `ox`/`oy` (log-expense's
 * income button; the + circle by default, for the nav's quick-add menu) until
 * it covers everything, and the form fades in on top. Any way out (X, a save,
 * back) first shrinks the disc back to where it came from. */
function QuickIncomeModal() {
  const { ox, oy } = useLocalSearchParams<{ ox?: string; oy?: string }>();
  const navigation = useNavigation();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  // The screen, not the window: on Android the window leaves out the system bars
  // the app draws behind, so a disc sized to it stops short of the bottom corners.
  const { width, height } = Dimensions.get("screen");
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const leaving = useRef(false);

  const cx = ox ? Number(ox) : width / 2;
  const cy = oy ? Number(oy) : height - insets.bottom - 50;
  // Reaches the farthest corner from the origin.
  const r = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy)) + 2;

  useEffect(() => {
    progress.value = withTiming(1, { duration: 550, easing: EASE });
  }, [progress]);

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (leaving.current || reduceMotion) return;
        e.preventDefault();
        leaving.current = true;
        const leave = () => navigation.dispatch(e.data.action);
        progress.value = withTiming(0, { duration: 420, easing: EASE }, (done) => {
          if (done) runOnJS(leave)();
        });
      }),
    [navigation, progress, reduceMotion],
  );

  const discStyle = useAnimatedStyle(() => ({ transform: [{ scale: progress.value }] }));
  // The form shows only once the green is (nearly) everywhere, and goes first on the way out.
  const formStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.65, 1], [0, 1], "clamp") }));

  return (
    <>
      <Reanimated.View
        pointerEvents="none"
        style={[styles.disc, { left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: r }, discStyle]}
      />
      <Reanimated.View style={[StyleSheet.absoluteFill, formStyle]}>
        <IncomeForm flood />
      </Reanimated.View>
    </>
  );
}

const styles = StyleSheet.create({
  disc: { position: "absolute", backgroundColor: INCOME_FLOOD },
});

export default withReadOnlyGate(QuickIncomeModal);
