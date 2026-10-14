// Import each weight from its own subpath, never from the package root.
// Metro doesn't tree-shake, so `from '@expo-google-fonts/geist'` pulls that
// package's index, which requires all 18 weights (every italic included) and
// ships every one of them in the APK. The subpath entry points require exactly
// one .ttf each, so only the 4 weights below get bundled.
import { useFonts } from 'expo-font'
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular'
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium'
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold'
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold'

// Token names are from the Fredoka/Nunito days; the weights are remapped, not
// copied. Nunito is rounded and reads light, so its 800/900 look heavy in Geist.
export const fontFamily = {
  displayMedium: 'Geist_600SemiBold',
  displaySemiBold: 'Geist_600SemiBold',
  displayBold: 'Geist_700Bold',
  bodyMedium: 'Geist_400Regular',
  bodySemiBold: 'Geist_500Medium',
  bodyBold: 'Geist_600SemiBold',
  bodyExtraBold: 'Geist_700Bold',
  bodyBlack: 'Geist_700Bold',
} as const

// Home-screen widgets can't load JS fonts: react-native-android-widget embeds
// these .ttf files at build time (app.json, assets/fonts). Swapping them is a
// native change, so widgets stay on Fredoka/Nunito until the next store build.
export const widgetFontFamily = {
  displayBold: 'Fredoka_700Bold',
  bodySemiBold: 'Nunito_600SemiBold',
  bodyMedium: 'Nunito_500Medium',
} as const

export function useAppFonts() {
  return useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
  })
}
