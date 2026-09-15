import { removeDownloadedFile, retainDownloadedFile } from "./media-downloads";

export type MediaObjectLoader = (signal: AbortSignal) => Promise<string>;

const RETENTION_MS = 60_000;

type Entry = {
  controller: AbortController;
  loading: Promise<string> | null;
  uri: string | null;
  holdRelease: (() => void) | null;
  acquirers: number;
  retentionTimer: ReturnType<typeof setTimeout> | null;
};

const entries = new Map<string, Entry>();

function finalize(mediaId: string, entry: Entry): void {
  if (entries.get(mediaId) !== entry) return;
  entries.delete(mediaId);
  if (entry.retentionTimer) clearTimeout(entry.retentionTimer);
  if (entry.loading) entry.controller.abort();
  entry.holdRelease?.();
}

/**
 * Shares one downloaded file per mediaId across concurrent consumers (preview and
 * playback). Builds on media-downloads' own share-hold counting instead of a
 * parallel registry: once the load settles, the cache takes a single
 * `retainDownloadedFile` hold and keeps it for RETENTION_MS after the last
 * acquirer releases, so a quick preview -> play sequence never re-downloads.
 * Concurrent acquirers share one in-flight load; releasing one acquirer never
 * aborts another acquirer's still-active use.
 */
export function acquireMediaObject(
  mediaId: string,
  loader: MediaObjectLoader,
): Readonly<{ uri: Promise<string>; release: (immediate?: boolean) => void }> {
  let entry = entries.get(mediaId);
  if (!entry) {
    const created: Entry = {
      controller: new AbortController(),
      loading: null,
      uri: null,
      holdRelease: null,
      acquirers: 0,
      retentionTimer: null,
    };
    entries.set(mediaId, created);
    created.loading = loader(created.controller.signal)
      .then((uri) => {
        if (entries.get(mediaId) !== created) {
          removeDownloadedFile(uri);
          throw new Error("media_object_cache_stale");
        }
        created.uri = uri;
        created.loading = null;
        created.holdRelease = retainDownloadedFile(uri);
        return uri;
      })
      .catch((error) => {
        if (entries.get(mediaId) === created) entries.delete(mediaId);
        throw error;
      });
    entry = created;
  } else if (entry.retentionTimer) {
    clearTimeout(entry.retentionTimer);
    entry.retentionTimer = null;
  }
  const captured = entry;
  captured.acquirers += 1;
  let released = false;
  const release = (immediate = false): void => {
    if (released) return;
    released = true;
    if (entries.get(mediaId) !== captured) return;
    captured.acquirers -= 1;
    if (captured.acquirers > 0) return;
    if (immediate) {
      finalize(mediaId, captured);
      return;
    }
    captured.retentionTimer = setTimeout(
      () => finalize(mediaId, captured),
      RETENTION_MS,
    );
  };
  const uri = captured.uri
    ? Promise.resolve(captured.uri)
    : (captured.loading as Promise<string>);
  return { uri, release };
}

/** Drops every cached object immediately, aborting in-flight loads: account switch/logout. */
export function invalidateMediaObjectCache(): void {
  for (const [mediaId, entry] of [...entries]) finalize(mediaId, entry);
}
