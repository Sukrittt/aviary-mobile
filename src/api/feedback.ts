// Bug report / feedback form (Mobile/app/account/feedback.tsx), replacing the
// old Linking.openURL(github.com/.../issues/new) flow in app/account/help.tsx.
// The server (Web/app/api/feedback) records the report in Mongo — this module
// just posts the form fields plus device diagnostics.
import { apiFetch } from './client'
import { deviceLabel } from './workos'
import { getLastScreen } from '@/src/lib/analytics'
import * as Application from 'expo-application'
import type { PhotoMimeType } from './expenses'

export type FeedbackType = 'bug' | 'idea'

// Bare messages on purpose: app/_layout.tsx bounces any error whose message
// matches /: 401\b/ or /: 403\b/ to the sign-in screen. A status number here
// would misfire that guard on a report submission.
// `screenshot.image` is raw base64, same shape as an expense photo upload.
export async function submitFeedback(
  type: FeedbackType,
  title: string,
  description: string,
  screenshot?: { image: string; mimeType: PhotoMimeType },
): Promise<void> {
  const diagnostics = {
    appVersion: `${Application.nativeApplicationVersion ?? 'unknown'} (${Application.nativeBuildVersion ?? '?'})`,
    device: deviceLabel(),
    screen: getLastScreen(),
  }
  const resp = await apiFetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, title: title.trim(), description: description.trim(), diagnostics, ...(screenshot && { screenshot }) }),
    // A screenshot can take longer than the default 15s to go up on a slow connection.
    ...(screenshot && { signal: AbortSignal.timeout(60_000) }),
  })
  if (resp.status === 429) throw new Error('rate_limited')
  if (!resp.ok) throw new Error('failed')
}
