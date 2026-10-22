import { useEffect } from 'react'
import { Platform } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { useShareIntent } from 'expo-share-intent'
import { onPendingShare, peekPendingShare, setPendingShare } from '@/src/lib/pendingShare'

/**
 * Mounted always. Moves whatever another app shared to Aviary (a UPI success
 * screenshot, or its text receipt) into src/lib/pendingShare, then clears it
 * natively. Kept there, not in the library's state, so it survives a sign-in
 * that leaves the app for the browser.
 */
export function ShareCatcher() {
  // Android only: there's no iOS share extension yet.
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({ resetOnBackground: false, disabled: Platform.OS !== 'android' })

  useEffect(() => {
    if (!hasShareIntent) return
    const image = shareIntent.files?.find((f) => f.mimeType?.startsWith('image/'))
    if (image) setPendingShare({ image: { uri: image.path, mimeType: image.mimeType, width: image.width ?? 0, height: image.height ?? 0 } })
    else if (shareIntent.text) setPendingShare({ text: shareIntent.text })
    resetShareIntent()
  }, [hasShareIntent, shareIntent, resetShareIntent])

  return null
}

/** Mounted once signed in with access. Opens a waiting share, now or from before sign-in. */
export function ShareOpener() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const open = () => {
      // Not under the launch routing, which replaces whatever's on top once it resolves.
      if (pathname === '/loading' || pathname === '/setup' || pathname === '/modals/shared-payment') return
      if (peekPendingShare()) router.push('/modals/shared-payment' as Href)
    }
    open()
    return onPendingShare(open)
  }, [router, pathname])

  return null
}
