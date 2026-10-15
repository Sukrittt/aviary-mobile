import { useCurrency } from "@/src/context/CurrencyContext";
import { LoadingCaption } from "@/src/components/shared/LoadingCaption";
import { CheckIcon } from "@/src/components/shared/CheckIcon";
import { useTheme } from "@/src/theme/ThemeProvider";
import { fontFamily } from "@/src/theme/fonts";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeInDown,
  LinearTransition,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { RevealAmount } from "./ScanAnimations";

const PHOTO_W = 232;
const PHOTO_H = 310;
const DONE_W = 150;
const DONE_H = 200;
const SWEEP_MS = 2400;
const MAX_CHIPS = 4;
export const CHIP_STAGGER = 90;
const STAMP_DELAY = 150;
const CHIPS_START = 600;
const TOTAL_HOLD = 1500;
/** When the reveal hands off to review on its own, if not tapped first. */
export const revealMs = (chipCount: number) =>
  CHIPS_START + Math.min(chipCount, MAX_CHIPS + 1) * CHIP_STAGGER + TOTAL_HOLD;

// ponytail: the scan API returns no coordinates, so these mark where amounts
// usually sit on a receipt (right column), not where this bill's amounts are.
const HIGHLIGHTS = [
  { at: 0.24, w: 54 },
  { at: 0.34, w: 46 },
  { at: 0.44, w: 58 },
  { at: 0.54, w: 42 },
  { at: 0.8, w: 66 },
];

type Item = { key: string; name: string; price: number };

/** The scanning screen: the user's own bill under a sweeping beam while the
 * scan runs, then (once `items` arrive) a success check stamps onto the photo
 * and each line item pops out below it before handing off to review. */
export function ScanBeam({
  imageUri,
  items,
  total,
  onDone,
}: {
  imageUri: string | null;
  /** null while the scan is still running. */
  items: Item[] | null;
  total: number;
  onDone: () => void;
}) {
  const { tokens, radius, space, type } = useTheme();
  const { formatMoney } = useCurrency();
  const reduceMotion = useReducedMotion();
  const revealing = items !== null;

  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || revealing) return;
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
    );
  }, [reduceMotion, revealing, sweep]);

  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sweep.value * PHOTO_H - BEAM_GLOW }],
    // Fade at both ends so the loop restart doesn't snap.
    opacity: interpolate(sweep.value, [0, 0.06, 0.94, 1], [0, 1, 1, 0]),
  }));

  const stamp = useSharedValue(0);
  useEffect(() => {
    if (!revealing || reduceMotion) return;
    stamp.value = withDelay(
      STAMP_DELAY,
      withSequence(withTiming(1.15, { duration: 220 }), withSpring(1, { damping: 12, stiffness: 220 })),
    );
  }, [revealing, reduceMotion, stamp]);
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stamp.value > 0 ? 1 : 0,
    transform: [{ scale: stamp.value }, { rotate: `${(1 - stamp.value) * -20}deg` }],
  }));

  const chipCount = items ? Math.min(items.length, MAX_CHIPS) : 0;
  const extra = items ? items.length - chipCount : 0;
  useEffect(() => {
    if (!items) return;
    if (reduceMotion) {
      onDone();
      return;
    }
    const done = setTimeout(onDone, revealMs(items.length));
    return () => clearTimeout(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealing]);

  // Scrolls only when the reveal outgrows a compact screen; centered otherwise.
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.scrollBody} scrollEnabled={revealing}>
      <Pressable
        style={s.fill}
        onPress={revealing ? onDone : undefined}
        accessibilityRole={revealing ? "button" : undefined}
        accessibilityLabel={revealing ? "Scan done. Tap to review" : "Reading your bill"}
      >
        <Animated.View
          layout={LinearTransition.springify().damping(18)}
          style={[
            s.photo,
            {
              width: revealing ? DONE_W : PHOTO_W,
              height: revealing ? DONE_H : PHOTO_H,
              borderRadius: radius.lg,
              backgroundColor: tokens.cardSolid,
              borderColor: revealing ? tokens.mint : tokens.border,
              shadowColor: revealing ? tokens.mint : tokens.accent,
            },
          ]}
        >
          {imageUri && (
            <Image
              source={{ uri: imageUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          )}
          {!revealing && !reduceMotion && (
            <>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.18)" }]} />
              {HIGHLIGHTS.map((h) => (
                <Highlight
                  key={h.at}
                  at={h.at}
                  width={h.w}
                  sweep={sweep}
                  fill={tokens.mintSoft}
                  edge={tokens.mint}
                />
              ))}
              <Animated.View pointerEvents="none" style={[s.beam, beamStyle]}>
                <LinearGradient
                  colors={["transparent", tokens.accentSoft]}
                  style={{ height: BEAM_GLOW }}
                />
                <View style={[s.beamLine, { backgroundColor: tokens.accent, shadowColor: tokens.accent }]} />
              </Animated.View>
            </>
          )}
          {revealing && !reduceMotion && (
            <>
              <Animated.View
                entering={FadeIn.duration(250)}
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: tokens.mintSoft }]}
              />
              <View style={s.stampWrap} pointerEvents="none">
                <Animated.View style={[s.stamp, { backgroundColor: tokens.mint, shadowColor: tokens.mint }, stampStyle]}>
                  <CheckIcon color={tokens.onAccent} size={34} />
                </Animated.View>
              </View>
            </>
          )}
        </Animated.View>

        {!revealing ? (
          <View style={{ marginTop: space.xl, width: "100%" }}>
            <LoadingCaption
              phrases={[
                "Reading the bill…",
                "Finding the total…",
                "Spotting line items…",
                "Almost done…",
              ]}
            />
          </View>
        ) : (
          <View style={[s.list, { marginTop: space.xl, paddingHorizontal: space.lg }]}>
            <Animated.Text
              entering={FadeInDown.delay(STAMP_DELAY + 120)}
              style={[s.done, { color: tokens.mint, fontSize: type.bodyLg }]}
            >
              Bill scanned
            </Animated.Text>
            <Animated.Text
              entering={FadeIn.delay(CHIPS_START - 100)}
              style={[s.heading, { color: tokens.text2, fontSize: type.caption, marginTop: space.lg }]}
            >
              {items.length === 0
                ? "No line items, just the total"
                : `${items.length} ${items.length === 1 ? "item" : "items"}`}
            </Animated.Text>
            {items.slice(0, chipCount).map((it, i) => (
              <Animated.View
                key={it.key}
                entering={FadeInDown.delay(CHIPS_START + i * CHIP_STAGGER).springify().damping(16)}
                style={[
                  s.chip,
                  {
                    borderRadius: radius.md,
                    backgroundColor: tokens.cardSolid,
                    borderColor: tokens.border,
                    marginTop: space.sm,
                  },
                ]}
              >
                <Text numberOfLines={1} style={[s.chipName, { color: tokens.text, fontSize: type.body }]}>
                  {it.name || "Item"}
                </Text>
                <Text style={[s.chipAmount, { color: tokens.mint, fontSize: type.body }]}>
                  {formatMoney(it.price)}
                </Text>
              </Animated.View>
            ))}
            {extra > 0 && (
              <Animated.Text
                entering={FadeIn.delay(CHIPS_START + chipCount * CHIP_STAGGER)}
                style={[s.more, { color: tokens.text2, fontSize: type.caption, marginTop: space.sm }]}
              >
                {`+${extra} more`}
              </Animated.Text>
            )}
            <Animated.View
              entering={FadeIn.delay(CHIPS_START + chipCount * CHIP_STAGGER)}
              style={[s.total, { marginTop: space.lg, borderTopColor: tokens.border }]}
            >
              <Text style={[s.heading, { color: tokens.text2, fontSize: type.caption }]}>Bill total</Text>
              <RevealAmount value={total} size={type.title} color={tokens.text} />
            </Animated.View>
          </View>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Highlight({
  at,
  width,
  sweep,
  fill,
  edge,
}: {
  at: number;
  width: number;
  sweep: SharedValue<number>;
  fill: string;
  edge: string;
}) {
  // Lights up the moment the beam crosses it, then fades as the beam moves on.
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(sweep.value, [at - 0.02, at, at + 0.28], [0, 1, 0], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[s.highlight, { top: at * PHOTO_H - 9, width, backgroundColor: fill, borderColor: edge }, style]}
    />
  );
}

const BEAM_GLOW = 44;

const s = StyleSheet.create({
  // Centered in the space under the header; the bottom pad offsets it so the
  // photo sits at the screen's optical middle, not the body's.
  scroll: { flex: 1 },
  scrollBody: { flexGrow: 1 },
  fill: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  photo: {
    overflow: "hidden",
    borderWidth: 1,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  beam: { position: "absolute", left: 0, right: 0, top: 0 },
  beamLine: { height: 2, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  highlight: { position: "absolute", right: 16, height: 18, borderRadius: 6, borderWidth: 1 },
  list: { width: "100%" },
  stampWrap: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  stamp: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  done: { fontFamily: fontFamily.bodyBold, textAlign: "center" },
  heading: { fontFamily: fontFamily.bodySemiBold },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  chipName: { flex: 1, marginRight: 12, fontFamily: fontFamily.bodyMedium },
  chipAmount: { fontFamily: fontFamily.bodySemiBold, fontVariant: ["tabular-nums"] },
  more: { fontFamily: fontFamily.bodySemiBold, textAlign: "center" },
  total: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
