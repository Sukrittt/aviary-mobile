import { FlexWidget } from "react-native-android-widget";
import { buildWidgetTree } from "react-native-android-widget/src/api/build-widget-tree";
import { darkTokens, lightTokens } from "@/src/theme/tokens";
import { SignInWidget } from "./SignInWidget";

const schemes = [
  ["light", lightTokens],
  ["dark", darkTokens],
] as const;

const tree = (props: Partial<Parameters<typeof SignInWidget>[0]> & Pick<Parameters<typeof SignInWidget>[0], "widgetName">) =>
  buildWidgetTree(<SignInWidget tokens={lightTokens} scheme="light" width={250} height={250} {...props} />);

describe("SignInWidget", () => {
  it.each(
    (["Envelope", "EnvelopeBar", "EnvelopeMini"] as const).flatMap((widgetName) =>
      schemes.map(([scheme, tokens]) => [widgetName, scheme, tokens] as const),
    ),
  )("%s builds in %s", (widgetName, scheme, tokens) => {
    const size = widgetName === "EnvelopeBar" ? { width: 320, height: 64 } : widgetName === "EnvelopeMini" ? { width: 131, height: 184 } : { width: 250, height: 250 };
    expect(() => buildWidgetTree(<SignInWidget widgetName={widgetName} tokens={tokens} scheme={scheme} {...size} />)).not.toThrow();
  });

  // Same square card as the signed-in mini, so it doesn't change shape on sign-in.
  it.each([131, 110, 160])("draws the mini as a %idp square", (width) => {
    const card = tree({ widgetName: "EnvelopeMini", width, height: 184 }).children![0].props as { height: unknown };
    expect(card.height).toBe(width);
  });

  it("says what's going on and how to fix it, in every size", () => {
    const text = (widgetName: "Envelope" | "EnvelopeBar" | "EnvelopeMini") => JSON.stringify(tree({ widgetName }));
    expect(text("EnvelopeMini")).toContain('"text":"I\'m napping"');
    expect(text("EnvelopeBar")).toContain('"text":"Your budget\'s napping"');
    expect(text("Envelope")).toContain('"text":"Sign in and your budget lands here."');
    for (const name of ["Envelope", "EnvelopeBar", "EnvelopeMini"] as const) {
      expect(text(name)).toContain('"text":"Sign in"');
      expect(text(name)).not.toContain('"text":"Aviary"');
    }
  });

  it("fits more ghost rows on a taller large widget", () => {
    // The placeholder bars are the only fills in the border color.
    const fill = JSON.stringify(buildWidgetTree(<FlexWidget style={{ backgroundColor: lightTokens.border as never }} />).props).match(/"backgroundColor":"[^"]+"/)![0];
    const ghosts = (height: number) => JSON.stringify(tree({ widgetName: "Envelope", height })).split(fill).length - 1;
    expect(ghosts(250)).toBeGreaterThan(0);
    expect(ghosts(400)).toBeGreaterThan(ghosts(250));
  });
});
