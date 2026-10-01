import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useSyncExternalStore } from "react";

import type { MessageAttachmentMedia } from "./message-attachments-view";

export type MediaViewerParams = Readonly<{
  messageId: string;
  attachments: readonly MessageAttachmentMedia[];
  startIndex: number;
  /** E4/C4 hardening: binds this store entry to the route params that
   * opened it. `media-viewer-screen.tsx` only renders when its own route
   * `sessionId` param matches `current.sessionId` here, and `clearMediaViewer`
   * only clears an entry when the caller's `sessionId` still matches -- a
   * stale unmount (e.g. a route remount) cannot wipe a session that has
   * since replaced it. */
  sessionId: string;
}>;

let current: MediaViewerParams | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * R3 viewer-open API (`api_contracts.app_chat_parallel_interfaces.viewerApi`):
 * stores the full attachment list in this module-level memory store instead
 * of route params -- route params are serialized into the navigation
 * history, and the attachment list (several items, each with width/height/
 * duration) is both too large and unnecessary to carry that way; playback
 * still resolves signed URLs from each `mediaId` through the normal MD4/MD5
 * access flow, not from anything carried in the params. The route still
 * carries one small param, `sessionId` (E4), so the screen can recognize a
 * stale route instance.
 *
 * Root Stack route: `src/app/media-viewer.tsx`
 * (`presentation: "fullScreenModal"`, declared in `src/app/_layout.tsx`).
 */
export function openMediaViewer(
  params: Omit<MediaViewerParams, "sessionId">,
): void {
  const sessionId = randomUUID();
  current = { ...params, sessionId };
  notify();
  router.push({ pathname: "/media-viewer", params: { sessionId } });
}

/** Pops the viewer route. The store is cleared by the viewer when it
 * unmounts (`clearMediaViewer`), not here: clearing first re-rendered the
 * still-mounted viewer without params, whose "no params" guard closed it a
 * second time and popped the chat screen underneath too. */
export function closeMediaViewer(): void {
  if (router.canGoBack()) router.back();
}

/** Clears the store, but only for the session that opened it (E4): a stale
 * unmount's cleanup (e.g. from a route remount) must not wipe a session
 * that has already replaced it in `current`. Called by the viewer screen
 * when it unmounts, with the `sessionId` it rendered. */
export function clearMediaViewer(sessionId: string): void {
  if (current?.sessionId !== sessionId) return;
  current = null;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): MediaViewerParams | null {
  return current;
}

/** Read by `media-viewer-screen.tsx`. `null` means "opened with no (or
 * expired) params" -- e.g. a cold deep-link straight into the route -- and
 * the screen closes itself rather than rendering an empty pager. */
export function useMediaViewerParams(): MediaViewerParams | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test-only: clears the store between test cases. */
export function resetMediaViewerStoreForTests(): void {
  current = null;
}
