import { fontFamily } from "@/src/theme/fonts";
import { ArrowLeft } from "@/src/components/shared/icons";
import {
KeyboardAvoidingView,
Platform,
Pressable,
Text
} from "react-native";


import { ScanBeam } from "@/src/features/scan-bill/ScanBeam";
import { ScanConfirm } from "@/src/features/scan-bill/ScanConfirm";
import { ScanError } from "@/src/features/scan-bill/ScanError";
import { ScanReview } from "@/src/features/scan-bill/ScanReview";
import { ScreenHeader } from "@/src/components/shared/ScreenHeader";
import { styles } from "@/src/features/scan-bill/styles";
import { useScanBillController } from "@/src/features/scan-bill/useScanBillController";
export default function ScanBillScreen() {
 const state = useScanBillController();
 const {tokens, radius, type, phase, setPhase,  productItems, selecting, toggleSelecting} = state;
  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: tokens.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {phase === "confirm" ? (
        <ScreenHeader
          onLeft={() => setPhase("review")}
          leftIcon={ArrowLeft}
          title="Confirm your log"
        />
      ) : phase === "review" ? (
        <ScreenHeader
          title="Scan a bill"
          subtitle={`${productItems.length} ${productItems.length === 1 ? "item" : "items"} · scanned just now`}
          right={
            <Pressable
              onPress={toggleSelecting}
              style={[
                styles.selectToggle,
                {
                  borderRadius: radius.full,
                  borderColor: selecting ? tokens.accentInk : tokens.border,
                  backgroundColor: selecting
                    ? tokens.accentSoft
                    : tokens.inputBg,
                },
              ]}
            >
              <Text
                style={{
                  color: selecting ? tokens.accentInk : tokens.text2,
                  fontFamily: fontFamily.bodyBold,
                  fontSize: type.caption,
                }}
              >
                {selecting ? "Done" : "Select"}
              </Text>
            </Pressable>
          }
        />
      ) : (
        <ScreenHeader title="Scan a bill" />
      )}

      {(phase === "scanning" || phase === "reveal") && (
        <ScanBeam
          imageUri={state.scanImageUri}
          itemCount={phase === "reveal" ? productItems.length : null}
          onDone={state.finishReveal}
        />
      )}

      {phase === "error" && <ScanError {...state} />}

      {phase === "review" && <ScanReview {...state} />}

      {phase === "confirm" && <ScanConfirm {...state} />}

    </KeyboardAvoidingView>
  );
}
