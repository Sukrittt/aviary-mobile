import { requireOptionalNativeModule } from 'expo'

// Builds made before expo-image-manipulator was added don't ship its native
// module, and importing the package there throws. Probe first, like
// src/lib/observe.ts, so an OTA onto such a build keeps uploading as before.
type Manipulator = typeof import('expo-image-manipulator')
const manipulator: Manipulator | null = requireOptionalNativeModule('ExpoImageManipulator')
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-image-manipulator') as Manipulator)
  : null

/** Web's encodings (Web/src/features/scan-bill/image.ts): photos are for looking back at, bills must stay legible to the model. */
export const PHOTO_ENCODING = { maxEdge: 1280, quality: 0.8 }
export const BILL_ENCODING = { maxEdge: 2000, quality: 0.7 }

export type DownscaledImage = { uri: string; base64: string; mimeType: 'image/jpeg' }

/**
 * A picked image shrunk so its long edge fits `maxEdge`, as JPEG base64. The
 * picker hands over the camera's full resolution (1 to 3MB of base64 for a
 * 12MP photo); this is a tenth of that. Null means send the picker's own
 * image: it's already small enough, or this install can't resize.
 *
 * ponytail: sized from the picker's reported dimensions. If those ignore EXIF
 * rotation, the long edge lands up to 4:3 over `maxEdge`, still far under the
 * original. Render first and size from the ImageRef if that ever matters.
 */
export async function downscaleImage(
  asset: { uri: string; width: number; height: number },
  { maxEdge, quality }: { maxEdge: number; quality: number },
): Promise<DownscaledImage | null> {
  if (!manipulator || !(Math.max(asset.width, asset.height) > maxEdge)) return null
  const { ImageManipulator, SaveFormat } = manipulator
  try {
    const context = ImageManipulator.manipulate(asset.uri)
    const image = await context.resize(asset.width >= asset.height ? { width: maxEdge } : { height: maxEdge }).renderAsync()
    try {
      const saved = await image.saveAsync({ compress: quality, format: SaveFormat.JPEG, base64: true })
      return saved.base64 ? { uri: saved.uri, base64: saved.base64, mimeType: 'image/jpeg' } : null
    } finally {
      // The decoded bitmap is ~50MB for 12MP: free it now rather than at the next GC.
      image.release()
      context.release()
    }
  } catch {
    return null
  }
}
