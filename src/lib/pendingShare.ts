// A payment shared to Aviary from another app (a UPI success screen or its
// text receipt), waiting for a signed-in app to read it. Set by ShareCatcher
// the moment Android hands it over, taken by ShareOpener, which only mounts
// once signed in: a share made while signed out opens after sign-in.
// ponytail: memory only, so a share made signed out is lost if the app is killed before sign-in.

import type { PickedPhoto } from '@/src/features/log-expense/ExpensePhotoField'

export type SharedImage = { uri: string; mimeType: string; width: number; height: number }
export type PendingShare = { text: string } | { image: SharedImage }

let pending: PendingShare | null = null
const subs = new Set<() => void>()

export function setPendingShare(share: PendingShare): void {
  pending = share
  subs.forEach((fn) => fn())
}

export function peekPendingShare(): PendingShare | null {
  return pending
}

export function takePendingShare(): PendingShare | null {
  const share = pending
  pending = null
  return share
}

export function onPendingShare(fn: () => void): () => void {
  subs.add(fn)
  return () => subs.delete(fn)
}

// The shared screenshot, for the log sheet to attach when it couldn't be read.
// Same one-shot handoff as src/lib/pendingScanImage.ts.
let photo: PickedPhoto | null = null

export function setSharedPhoto(p: PickedPhoto): void {
  photo = p
}

export function takeSharedPhoto(): PickedPhoto | null {
  const p = photo
  photo = null
  return p
}
