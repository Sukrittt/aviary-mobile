import { useEffect, useRef } from "react";
import {
  Animated,
  View,
  Text,
  Pressable,
  Linking,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/ThemeProvider";
import { fontFamily } from "@/src/theme/fonts";
import { useSignIn } from "@/src/api/useSignIn";
import { AuthBackdrop } from "@/src/components/auth/AuthBackdrop";
import { UnlockIcon } from "@/src/components/shared/UnlockIcon";
import { BirdLandingMark } from "@/src/components/splash/BirdLandingMark";
import { WEB_URL } from "@/src/api/client";

// Screen 1 of the auth flow (mockup: isWelcome). Google sign-in and the
// "Continue with email" hop to /(auth)/email — no guest link, guest mode is
// gone from the UI. The root layout's Stack.Protected guards own where a
// completed sign-in lands next (tabs vs onboarding) — persisting the session
// swaps the screens out, so this screen just shows the flourish and waits.
export default function WelcomeScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, pending, done, error } = useSignIn();
  const shake = useRef(new Animated.Value(0)).current;
  const tap = () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  // Mirrors web's @keyframes auth-shake: 0.4s, 10 steps of 40ms.
  const triggerShake = () => {
    shake.setValue(0);
    const steps = [-1, 2, -4, 4, -4, 4, -4, 2, -1, 0];
    Animated.sequence(
      steps.map((v) =>
        Animated.timing(shake, {
          toValue: v,
          duration: 40,
          useNativeDriver: true,
        }),
      ),
    ).start();
  };

  useEffect(() => {
    if (error) triggerShake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <AuthBackdrop />
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.heroWrap}>
          <View style={styles.hero}>
            <View
              style={[
                styles.iconChip,
                { backgroundColor: tokens.accent, shadowColor: tokens.accent },
              ]}
            >
              <BirdLandingMark size={40} color={tokens.onAccent} autoplay={false} perched />
            </View>
            <Text
              style={[
                styles.title,
                { color: tokens.text, fontFamily: fontFamily.displaySemiBold },
              ]}
            >
              Less guessing.{"\n"}More living.
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: tokens.text2, fontFamily: fontFamily.bodyMedium },
              ]}
            >
              Sign in with a one-time code or Google. No passwords to remember, ever.
            </Text>
          </View>
        </View>

        <Animated.View style={{ transform: [{ translateX: shake }] }}>
          {error && (
            <Text
              style={[
                styles.error,
                { color: tokens.coral, fontFamily: fontFamily.bodyMedium },
              ]}
            >
              {error}
            </Text>
          )}

          <Pressable
            onPress={() => {
              tap();
              signIn();
            }}
            accessibilityRole="button"
            disabled={pending || done}
            style={[
              styles.googleButton,
              {
                backgroundColor: tokens.card,
                borderColor: tokens.borderStrong,
              },
            ]}
          >
            {done ? (
              <UnlockIcon color={tokens.text} />
            ) : (
              <>
                <View
                  style={[
                    styles.gBadge,
                    {
                      backgroundColor: tokens.inputBg,
                      borderColor: tokens.borderStrong,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.gBadgeText,
                      {
                        color: tokens.accentInk,
                        fontFamily: fontFamily.displaySemiBold,
                      },
                    ]}
                  >
                    G
                  </Text>
                </View>
                <Text
                  style={[
                    styles.googleText,
                    { color: tokens.text, fontFamily: fontFamily.bodyBold },
                  ]}
                >
                  {pending ? "Signing in…" : "Continue with Google"}
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              tap();
              router.push("/(auth)/email");
            }}
            disabled={pending || done}
            style={[styles.emailButton, { backgroundColor: tokens.accent }]}
          >
            <Text
              style={[
                styles.emailText,
                {
                  color: tokens.onAccent,
                  fontFamily: fontFamily.displaySemiBold,
                },
              ]}
            >
              Continue with email
            </Text>
          </Pressable>

          <Text
            style={[
              styles.legal,
              {
                color: tokens.text3,
                fontFamily: fontFamily.bodyMedium,
                marginTop: 12,
              },
            ]}
          >
            By continuing you confirm you&apos;re 18 or older and agree to the{" "}
            <Text
              style={{ color: tokens.accent }}
              onPress={() => Linking.openURL(`${WEB_URL}/legal/terms`)}
            >
              Terms
            </Text>{" "}
            and{" "}
            <Text
              style={{ color: tokens.accent }}
              onPress={() => Linking.openURL(`${WEB_URL}/legal/privacy`)}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  content: { flex: 1, paddingHorizontal: 24 },
  heroWrap: { flex: 1, justifyContent: "center" },
  hero: { gap: 14 },
  iconChip: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 10,
  },
  title: { fontSize: 34, lineHeight: 38, letterSpacing: -0.3 },
  subtitle: { fontSize: 15, lineHeight: 22, maxWidth: 300 },
  error: { fontSize: 13, marginBottom: 10, textAlign: "center" },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 54,
    borderRadius: 28,
    borderWidth: 1,
  },
  gBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  gBadgeText: { fontSize: 13 },
  googleText: { fontSize: 15 },
  emailButton: {
    minHeight: 54,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  emailText: { fontSize: 15 },
  legal: { fontSize: 11, textAlign: "center", lineHeight: 17, marginTop: 6, maxWidth: 280, alignSelf: "center" },
});
