import { Sparkle, Warning } from "@/src/components/shared/icons";
import { fontFamily } from "@/src/theme/fonts";
import {
  Pressable,
  Text,
  View
} from "react-native";


import { styles } from "./styles";
import type { useScanBillController } from "./useScanBillController";
type Props = Pick<ReturnType<typeof useScanBillController>, "tokens" | "space" | "radius" | "type" | "router" | "errorMsg" | "allowanceHit">;
export function ScanError({ tokens, space, radius, type, router, errorMsg, allowanceHit }: Props) {
  return (<View
    style={[
      styles.centerFill,
      { paddingHorizontal: space.lg, gap: space.lg },
    ]}
  >
    <View
      style={{
        width: 64,
        height: 64,
        borderRadius: radius.full,
        backgroundColor: tokens.chipActiveBg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {allowanceHit ? (
        <Sparkle size={26} color={tokens.text3} />
      ) : (
        <Warning size={26} color={tokens.text3} />
      )}
    </View>
    <Text
      style={{
        color: tokens.text2,
        fontFamily: fontFamily.bodyMedium,
        fontSize: type.body,
        textAlign: "center",
        maxWidth: 260,
      }}
    >
      {errorMsg}
    </Text>
    <Pressable
      onPress={() => router.replace("/modals/log-expense")}
      style={[
        styles.confirm,
        {
          backgroundColor: tokens.accent,
          borderRadius: radius.full,
          paddingVertical: space.md,
          paddingHorizontal: space.xl,
        },
      ]}
    >
      <Text
        style={{
          color: tokens.onAccent,
          fontFamily: fontFamily.bodyBold,
          fontSize: type.bodyLg,
        }}
      >
        Enter manually
      </Text>
    </Pressable>
  </View>);
}
