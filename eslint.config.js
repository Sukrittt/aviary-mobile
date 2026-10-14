// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".claude/**", "scripts/*.mjs"],
  },
  {
    // react-hooks/refs and react-hooks/immutability are React Compiler-derived
    // rules; this app doesn't run the compiler. File-by-file triage (2026-08)
    // found every hit was a false positive on established RN/Reanimated idioms
    // (Animated.Value read in render, SharedValue mutation inside a worklet/
    // event handler, a ref kept fresh during render for a stable imperative
    // callback) — no genuine bugs. Turned off rather than left at warn.
    //
    // react-hooks/set-state-in-effect reverted to eslint-config-expo's default
    // (error): the same triage found its warnings mostly legitimate (syncing to
    // an async result / route param / external animation), each silenced
    // individually with an eslint-disable-next-line + reason, so a genuinely
    // new violation is caught at error level instead of blending into a warn.
    rules: {
      // Reanimated's runOnJS/scheduleOnRN can only schedule a function that
      // was DEFINED on the RN runtime. An inline arrow written at the call
      // site inside a worklet is created on the UI runtime, and the native
      // side throws "Locally defined function passed to scheduleOnRN" out of
      // an animation callback, which crashes the app. Hoist the callback (a
      // useCallback / module-level fn) and pass the reference.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name=/^(runOnJS|scheduleOnRN)$/] > :matches(ArrowFunctionExpression, FunctionExpression):first-child",
          message:
            "Pass a reference to a function defined on the JS runtime (e.g. useCallback) — an inline function is created on the UI runtime and crashes scheduleOnRN.",
        },
        {
          // The leading `.` in each pattern requires a character before the em
          // dash, so a standalone '—' (the app's placeholder glyph for a
          // missing value, e.g. EnvelopeRow.tsx / DatePicker.tsx) is exempt.
          // Comments aren't AST literals, so they're untouched too.
          selector:
            "Literal[value=/.—/], JSXText[value=/.—/], TemplateElement[value.raw=/.—/]",
          message:
            "No em dashes in user-facing copy — split it into two sentences. See CLAUDE.md's 'voice and copy' section.",
        },
      ],
      // Metro doesn't tree-shake: a runtime import from the package root bundles
      // all 1,500 icons in every weight. Types are fine, they're erased.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "phosphor-react-native",
              allowTypeImports: true,
              message:
                "Import icons from '@/components/shared/icons' (add a deep import there if it's missing). The package root bundles every icon.",
            },
          ],
        },
      ],
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "@typescript-eslint/no-require-imports": [
        "warn",
        {
          // Same asset extensions eslint-config-expo already allows, plus
          // `lottie` — metro.config.js registers it as an asset extension too,
          // this just closes the same gap for the linter.
          allow: [
            "\\.(aac|aiff|avif|bmp|caf|db|gif|heic|html|jpeg|jpg|json|lottie|m4a|m4v|mov|mp3|mp4|mpeg|mpg|otf|pdf|png|psd|svg|ttf|wav|webm|webp|xml|yaml|yml|zip)$",
          ],
        },
      ],
    },
  },
]);
