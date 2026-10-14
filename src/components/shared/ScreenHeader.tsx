import { useTheme } from "@/src/theme/ThemeProvider";
import { fontFamily } from "@/src/theme/fonts";
import { type PhosphorIcon } from "@/src/components/shared/icons";
import { type ReactNode } from "react";
import {
  Pressable,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";


import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8 }, headerTitle: {} });
export function ScreenHeader({
  onLeft,
  leftIcon: LeftIcon,
  title,
  subtitle,
  right,
  style, titleStyle, leftStyle, includeSafeArea = true,
}: {
  onLeft?: () => void;
  leftIcon?: PhosphorIcon;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  leftStyle?: StyleProp<ViewStyle>;
  includeSafeArea?: boolean;
}) {
  const { tokens, space, type } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: (includeSafeArea ? insets.top : 0) + space.sm,
          paddingHorizontal: space.lg,
          gap: space.sm,
        },
        style,
      ]}
    >
      {onLeft && LeftIcon && (
        <Pressable onPress={onLeft} hitSlop={12} accessibilityLabel="Close" style={leftStyle}>
          <LeftIcon size={22} color={tokens.text} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.headerTitle,
            {
              color: tokens.text,
              fontFamily: fontFamily.displaySemiBold,
              fontSize: type.bodyLg,
            },
            titleStyle,
          ]}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={{
              color: tokens.text3,
              fontFamily: fontFamily.bodySemiBold,
              fontSize: type.micro,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {right ?? <View style={{ width: 22 }} />}
    </View>
  );
}

