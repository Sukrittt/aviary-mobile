import { requireOptionalNativeModule } from 'expo'
import type { PickedFile } from '@/src/api/imports'

/**
 * Whether this binary has the document picker. An OTA update can land on a
 * build from before expo-document-picker was added, where importing it throws
 * at load; onboarding only offers an import when this is true.
 */
export const canPickFiles = requireOptionalNativeModule('ExpoDocumentPicker') != null

/** The system file picker, any type: Android often labels a csv as octet-stream. Null when cancelled. */
export async function pickFile(): Promise<(PickedFile & { size?: number }) | null> {
  // Required here, not at the top, so a binary without the module never loads it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getDocumentAsync } = require('expo-document-picker') as typeof import('expo-document-picker')
  const res = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
  if (res.canceled || !res.assets[0]) return null
  const { uri, name, mimeType, size } = res.assets[0]
  return { uri, name, mimeType, size }
}
