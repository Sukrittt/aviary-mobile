// Runs headless — no app mounted, no React context, no QueryClient. Handles
// only what WidgetSync (app-side, src/widgets/WidgetSync.tsx) can't: a widget
// being added/resized, or the OS's 30-minute update timer while the app
// isn't open. Reads the last snapshot the app wrote; never fetches, never
// touches auth — see the plan's note on why (WorkOS refresh-token rotation
// races between this JS realm and the app's).
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { readThemePreference } from "@/src/theme/pref";
import { readSnapshot } from "./snapshot";
import { variants } from "./variants";
import { EnvelopeWidget } from "./EnvelopeWidget";
import { EnvelopeBarWidget } from "./EnvelopeBarWidget";
import { EnvelopeMiniWidget } from "./EnvelopeMiniWidget";
import { SignInWidget } from "./SignInWidget";

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED": {
      const [data, preference] = await Promise.all([
        readSnapshot(),
        readThemePreference(),
      ]);
      const { widgetName, width, height } = props.widgetInfo;
      const compact = widgetName !== "Envelope";

      if (!data) {
        props.renderWidget(
          variants(preference, (tokens, scheme) => (
            <SignInWidget tokens={tokens} scheme={scheme} compact={compact} />
          )),
        );
        break;
      }

      switch (widgetName) {
        case "EnvelopeBar":
          props.renderWidget(
            variants(preference, (tokens, scheme) => (
              <EnvelopeBarWidget
                {...data}
                tokens={tokens}
                scheme={scheme}
                width={width}
                height={height}
              />
            )),
          );
          break;
        case "EnvelopeMini":
          props.renderWidget(
            variants(preference, (tokens, scheme) => (
              <EnvelopeMiniWidget
                {...data}
                tokens={tokens}
                scheme={scheme}
                width={width}
              />
            )),
          );
          break;
        default:
          props.renderWidget(
            variants(preference, (tokens, scheme) => (
              <EnvelopeWidget
                {...data}
                tokens={tokens}
                scheme={scheme}
                width={width}
                height={height}
              />
            )),
          );
          break;
      }
      break;
    }
    default:
      break;
  }
}
