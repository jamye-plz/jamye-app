import { removeDownloadedFile } from "../platform/media-downloads";

export type ThumbnailCacheState =
  | { status: "loading" }
  | { status: "ready"; uri: string }
  | { status: "error" };

export type ThumbnailJob = (controller: AbortController) => Promise<string>;

const GRACE_MS = 5_000;
const MAX_RETRIES = 3;

type Entry = {
  controller: AbortController;
  promise: Promise<string> | null;
  state: ThumbnailCacheState;
  holders: number;
  graceTimer: ReturnType<typeof setTimeout> | null;
};

type Slot = {
  entry: Entry | null;
  retries: number;
};

const accounts = new Map<string, Map<string, Slot>>();

function scope(accountKey: string): Map<string, Slot> {
  let map = accounts.get(accountKey);
  if (!map) {
    map = new Map();
    accounts.set(accountKey, map);
  }
  return map;
}

function slotFor(accountKey: string, mediaId: string): Slot {
  const map = scope(accountKey);
  let slot = map.get(mediaId);
  if (!slot) {
    slot = { entry: null, retries: 0 };
    map.set(mediaId, slot);
  }
  return slot;
}

/**
 * Clears `slot`'s current entry (aborting any in-flight job, cleaning up a
 * ready file). When that leaves the slot with no entry and no retries spent
 * on it, the slot itself is dropped from the account's map too — a slot with
 * unspent retries is kept so `retryThumbnail`/`canRetryThumbnail` accounting
 * survives the drop, but a never-retried slot has nothing worth remembering
 * and would otherwise accumulate forever across a long scrolling session.
 */
function dropEntry(
  accountKey: string,
  mediaId: string,
  slot: Slot,
  entry: Entry,
): void {
  if (slot.entry !== entry) return;
  slot.entry = null;
  if (entry.graceTimer) clearTimeout(entry.graceTimer);
  if (entry.promise) entry.controller.abort();
  if (entry.state.status === "ready") removeDownloadedFile(entry.state.uri);
  if (slot.retries === 0) accounts.get(accountKey)?.delete(mediaId);
}

function startEntry(slot: Slot, job: ThumbnailJob): Entry {
  const controller = new AbortController();
  const entry: Entry = {
    controller,
    promise: null,
    state: { status: "loading" },
    holders: 0,
    graceTimer: null,
  };
  slot.entry = entry;
  entry.promise = job(controller)
    .then((uri) => {
      if (slot.entry === entry) {
        entry.state = { status: "ready", uri };
        entry.promise = null;
      } else {
        // The entry was cleared (invalidation/retry/grace timeout) before this job
        // settled: a late file has no owner, so it must be cleaned up here.
        removeDownloadedFile(uri);
      }
      return uri;
    })
    .catch((error) => {
      if (slot.entry === entry) {
        entry.promise = null;
        if (!controller.signal.aborted) entry.state = { status: "error" };
      }
      throw error;
    });
  return entry;
}

/**
 * Shares one thumbnail generation job per (account, mediaId) across every card
 * instance rendering it: a remount or a second card reuses the in-flight promise
 * or the ready file instead of regenerating. `release()` keeps the job alive for
 * GRACE_MS so a card that briefly scrolls off-screen and back reuses the same
 * job; pass `immediate: true` (component unmount) to skip the grace window.
 */
export function acquireThumbnail(
  accountKey: string,
  mediaId: string,
  job: ThumbnailJob,
): Readonly<{
  state: ThumbnailCacheState;
  promise: Promise<string> | null;
  release: (immediate?: boolean) => void;
}> {
  const slot = slotFor(accountKey, mediaId);
  let entry = slot.entry;
  if (!entry) entry = startEntry(slot, job);
  else if (entry.graceTimer) {
    clearTimeout(entry.graceTimer);
    entry.graceTimer = null;
  }
  const captured = entry;
  captured.holders += 1;
  let released = false;
  const release = (immediate = false): void => {
    if (released) return;
    released = true;
    if (slot.entry !== captured) return;
    captured.holders -= 1;
    if (captured.holders > 0) return;
    if (immediate) {
      dropEntry(accountKey, mediaId, slot, captured);
      return;
    }
    captured.graceTimer = setTimeout(
      () => dropEntry(accountKey, mediaId, slot, captured),
      GRACE_MS,
    );
  };
  return { state: captured.state, promise: captured.promise, release };
}

/** Clears the cached result/error for a manual retry. Allowed at most 3 times per mediaId. */
export function retryThumbnail(accountKey: string, mediaId: string): boolean {
  const slot = slotFor(accountKey, mediaId);
  if (slot.retries >= MAX_RETRIES) return false;
  slot.retries += 1;
  if (slot.entry) dropEntry(accountKey, mediaId, slot, slot.entry);
  return true;
}

export function canRetryThumbnail(
  accountKey: string,
  mediaId: string,
): boolean {
  return (accounts.get(accountKey)?.get(mediaId)?.retries ?? 0) < MAX_RETRIES;
}

/** A locally undecodable ready image (e.g. a corrupt JPEG) is its own failure mode. */
export function markThumbnailImageFailed(
  accountKey: string,
  mediaId: string,
): void {
  const slot = accounts.get(accountKey)?.get(mediaId);
  if (!slot?.entry || slot.entry.state.status !== "ready") return;
  dropEntry(accountKey, mediaId, slot, slot.entry);
}

/** Drops every cached entry for an account immediately: background/logout invalidation. */
export function invalidateThumbnailCache(accountKey: string): void {
  const map = accounts.get(accountKey);
  if (!map) return;
  accounts.delete(accountKey);
  for (const [mediaId, slot] of map.entries()) {
    if (slot.entry) dropEntry(accountKey, mediaId, slot, slot.entry);
  }
}
