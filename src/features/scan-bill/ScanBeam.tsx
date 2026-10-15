import { LoadingCaption } from "@/src/components/shared/LoadingCaption";
import { CheckIcon } from "@/src/components/shared/CheckIcon";
import { useTheme } from "@/src/theme/ThemeProvider";
import { fontFamily } from "@/src/theme/fonts";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
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

const PHOTO_W = 232;
const PHOTO_H = 310;
const DONE_W = 150;
const DONE_H = 200;
const SWEEP_MS = 2400;
const STAMP_DELAY = 150;
const COUNT_DELAY = 450;
/** When the reveal hands off to review on its own, if not tapped first: the
 * stamp settles and the count lands, then about a second to take it in. */
export const REVEAL_MS = COUNT_DELAY + 1100;

// ponytail: the scan API returns no coordinates, so these mark where amounts
// usually sit on a receipt (right column), not where this bill's amounts are.
const HIGHLIGHTS = [
  { at: 0.24, w: 54 },
  { at: 0.34, w: 46 },
  { at: 0.44, w: 58 },
  { at: 0.54, w: 42 },
  { at: 0.8, w: 66 },
];

/** The scanning screen: the user's own bill under a sweeping beam while the
 * scan runs, then (once `itemCount` arrives) a success check stamps onto the
 * photo with how many items it found before handing off to review. */
export function ScanBeam({
  imageUri,
  itemCount,
  onDone,
}: {
  imageUri: string | null;
  /** null while the scan is still running. */
  itemCount: number | null;
  onDone: () => void;
}) {
  const { tokens, radius, space, type } = useTheme();
  const reduceMotion = useReducedMotion();
  const revealing = itemCount !== null;

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

  useEffect(() => {
    if (!revealing) return;
    if (reduceMotion) {
      onDone();
      return;
    }
    const done = setTimeout(onDone, REVEAL_MS);
    return () => clearTimeout(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealing]);

  return (
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
        <View style={{ marginTop: space.xl, alignItems: "center" }}>
          <Animated.Text
            entering={FadeInDown.delay(STAMP_DELAY + 120)}
            style={[s.done, { color: tokens.mint, fontSize: type.title }]}
          >
            Bill scanned
          </Animated.Text>
          <Animated.Text
            entering={FadeInDown.delay(COUNT_DELAY)}
            style={[s.count, { color: tokens.text2, fontSize: type.body, marginTop: space.xs }]}
          >
            {itemCount === 0
              ? "No line items, just the total"
              : `${itemCount} ${itemCount === 1 ? "item" : "items"} found`}
          </Animated.Text>
        </View>
      )}
    </Pressable>
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
  fill: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
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
  count: { fontFamily: fontFamily.bodySemiBold, textAlign: "center" },
});
