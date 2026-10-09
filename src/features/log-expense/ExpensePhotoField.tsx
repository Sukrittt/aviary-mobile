import type { PhotoMimeType } from '@/src/api/expenses'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { Camera, ImageIcon, X } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Pressable, Text, View } from 'react-native'

export type PickedPhoto = { uri: string; base64: string; mimeType: PhotoMimeType }

const MIME_TYPES: PhotoMimeType[] = ['image/jpeg', 'image/png', 'image/webp']

/**
 * The "Photo (optional)" field in log-expense's More sheet. Picking mirrors
 * the bill scan in More (same options), and only hands the photo up: the
 * screen decides when it uploads.
 */
export function ExpensePhotoField({ uri, loading, offline, busy, onPicked, onRemove }: {
  uri: string | null
  loading?: boolean
  offline: boolean
  // While the expense saves, the selection is already captured for upload.
  busy?: boolean
  onPicked: (photo: PickedPhoto) => void
  onRemove: () => void
}) {
  const { tokens, space, radius } = useTheme()
  const [viewing, setViewing] = useState(false)
  const disabled = offline || !!busy

  async function pick(source: 'camera' | 'library') {
    Haptics.selectionAsync().catch(() => {})
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera or photo access is off. You can turn it on in Settings.')
      return
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true }
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options)
    const asset = result.canceled ? undefined : result.assets?.[0]
    if (!asset) return
    if (!asset.base64) {
      Alert.alert("Couldn't read that photo", 'Try another one.')
      return
    }
    // An unknown type (e.g. HEIC) can't be relabeled: the bytes stay HEIC.
    // A missing type is the picker's JPEG re-encode.
    const mimeType = asset.mimeType ? MIME_TYPES.find((m) => m === asset.mimeType) : 'image/jpeg'
    if (!mimeType) {
      Alert.alert("That photo type isn't supported", 'Try a JPEG or PNG.')
      return
    }
    onPicked({ uri: asset.uri, base64: asset.base64, mimeType })
  }

  const label = { color: tokens.text3, fontFamily: fontFamily.bodySemiBold, fontSize: 12 }
  const button = {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs,
    paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.full,
    backgroundColor: tokens.inputBg, opacity: disabled ? 0.5 : 1,
  }
  const buttonText = { color: tokens.accentInk, fontFamily: fontFamily.bodySemiBold }

  return (
    <View style={{ gap: space.sm }}>
      <Text style={label}>Photo (optional)</Text>
      {(uri || loading) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          {uri ? (
            <Pressable onPress={() => setViewing(true)} accessibilityRole="button" accessibilityLabel="View photo">
              <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: radius.md }} />
            </Pressable>
          ) : (
            <View style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: tokens.inputBg, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={tokens.text3} />
            </View>
          )}
          {uri && (
            <Pressable onPress={onRemove} disabled={disabled} accessibilityRole="button" accessibilityLabel="Remove photo" style={button}>
              <X size={16} color={tokens.accentInk} />
              <Text style={buttonText}>Remove</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Pressable onPress={() => void pick('camera')} disabled={disabled} accessibilityRole="button" accessibilityLabel="Take photo" style={button}>
          <Camera size={16} color={tokens.accentInk} />
          <Text style={buttonText}>{uri ? 'Retake' : 'Take photo'}</Text>
        </Pressable>
        <Pressable onPress={() => void pick('library')} disabled={disabled} accessibilityRole="button" accessibilityLabel="Choose photo" style={button}>
          <ImageIcon size={16} color={tokens.accentInk} />
          <Text style={buttonText}>{uri ? 'Choose another' : 'Choose photo'}</Text>
        </Pressable>
      </View>
      {offline && <Text style={{ color: tokens.text3 }}>You can add a photo once you&apos;re back online.</Text>}
      <Modal visible={viewing && !!uri} transparent animationType="fade" onRequestClose={() => setViewing(false)}>
        <Pressable onPress={() => setViewing(false)} accessibilityRole="button" accessibilityLabel="Close photo"
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.92)', padding: space.lg }}>
          {uri && <Image source={{ uri }} style={{ flex: 1 }} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </View>
  )
}
