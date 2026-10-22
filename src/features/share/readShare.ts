import { File } from 'expo-file-system'
import { readStatement } from '@/src/api/statement'
import type { PhotoMimeType } from '@/src/api/expenses'
import type { PickedPhoto } from '@/src/features/log-expense/ExpensePhotoField'
import { downscaleImage } from '@/src/lib/downscaleImage'
import type { PendingShare, SharedImage } from '@/src/lib/pendingShare'
import { parseUpiText, type SharedPayment } from './upiShare'

/** statement.tsx's screenshot encoding: small enough to upload fast, sharp enough to read. */
const SCREENSHOT_ENCODING = { maxEdge: 1600, quality: 0.6 }
const MIME_TYPES: PhotoMimeType[] = ['image/jpeg', 'image/png', 'image/webp']

export type ShareReading =
  | { payment: SharedPayment; loggedOnServer: boolean }
  /** Couldn't read it: the log sheet opens with the screenshot attached (if there was one) and no amount. */
  | { payment: null; photo?: PickedPhoto }

async function encode(image: SharedImage): Promise<PickedPhoto | null> {
  const uri = image.uri.includes('://') ? image.uri : `file://${image.uri}`
  try {
    const small = await downscaleImage({ uri, width: image.width, height: image.height }, SCREENSHOT_ENCODING)
    if (small) return small
    const mimeType = MIME_TYPES.find((m) => m === image.mimeType)
    if (!mimeType) return null
    return { uri, base64: await new File(uri).base64(), mimeType }
  } catch {
    return null
  }
}

/**
 * A shared payment, read. A screenshot goes through the same reader as
 * uploading screenshots (POST /api/expenses/statement), so it's gated and
 * counted against the AI allowance like bill scan, and the server says when
 * it's already logged. A text receipt is read on the phone.
 */
export async function readShare(share: PendingShare): Promise<ShareReading> {
  if ('text' in share) {
    const payment = parseUpiText(share.text)
    return payment ? { payment, loggedOnServer: false } : { payment: null }
  }
  const photo = await encode(share.image)
  if (!photo) return { payment: null }
  try {
    const proposal = await readStatement({ images: [{ data: photo.base64, mimeType: photo.mimeType }] })
    // A success screen is one payment. A history screenshot gives several: take the first.
    const item = proposal.items[0]
    if (!item) return { payment: null, photo }
    return {
      payment: { amount: item.amount, payee: item.item, date: item.date, category: item.category },
      loggedOnServer: item.suggestSkip === 'logged',
    }
  } catch {
    return { payment: null, photo }
  }
}
