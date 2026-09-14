import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

const DOWNLOADS_DIR_NAME = "media-downloads";
const SAFE_NAME_PATTERN = /[^A-Za-z0-9._-]+/g;
const shareHolds = new Map<string, number>();
const pendingRemovals = new Set<string>();

/** Retain an OS handoff/player file until its native owner releases it. */
export function retainDownloadedFile(uri: string): () => void {
  if (!isOwnedDownloadFile(uri)) throw new Error("invalid_download_file");
  shareHolds.set(uri, (shareHolds.get(uri) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (shareHolds.get(uri) ?? 1) - 1;
    if (remaining > 0) shareHolds.set(uri, remaining);
    else {
      shareHolds.delete(uri);
      if (pendingRemovals.delete(uri)) removeDownloadedFile(uri);
    }
  };
}

function sanitizeFilename(candidate: string | null): string {
  const base = (candidate ?? "").split(/[/\\]/).pop() ?? "";
  const safe = base.replace(SAFE_NAME_PATTERN, "_").slice(0, 120);
  return safe.length > 0 ? safe : "media";
}

function downloadsDirectory(create: boolean): Directory {
  const directory = new Directory(Paths.cache, DOWNLOADS_DIR_NAME);
  if (create && !directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

function isCanonicalDirectChild(uri: string, directory: Directory): boolean {
  const directoryUri = directory.uri.endsWith("/")
    ? directory.uri
    : `${directory.uri}/`;
  if (!uri.startsWith(directoryUri)) return false;
  const name = uri.slice(directoryUri.length);
  if (
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("%") ||
    name.includes("?") ||
    name.includes("#")
  ) {
    return false;
  }
  try {
    return new File(directory, name).uri === uri;
  } catch {
    return false;
  }
}

export function isOwnedDownloadFile(uri: string): boolean {
  return isCanonicalDirectChild(uri, downloadsDirectory(false));
}

/**
 * Allocates an app-owned destination for media access/download, ahead of streaming
 * bytes into it. The returned `File` does not exist on disk yet.
 */
export function allocateDownloadDestination(
  input: Readonly<{ mediaId: string; filename: string | null }>,
): File {
  const directory = downloadsDirectory(true);
  const name = `${randomUUID()}-${sanitizeFilename(input.mediaId)}-${sanitizeFilename(input.filename)}`;
  return new File(directory, name);
}

/** Deletes one previously downloaded file. Safe to call on an already-removed file. */
export function removeDownloadedFile(uri: string): void {
  try {
    if (!isOwnedDownloadFile(uri)) return;
    if (shareHolds.has(uri)) {
      pendingRemovals.add(uri);
      return;
    }
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best effort under filesystem races; the next account/startup sweep retries.
  }
}

/** Sweep stale owned files but retain native handoffs/players until their cleanup. */
export function cleanupAllDownloadedFiles(): void {
  const directory = downloadsDirectory(false);
  if (!directory.exists) return;
  if (shareHolds.size === 0) directory.delete();
  else {
    for (const entry of directory.list()) {
      if (!shareHolds.has(entry.uri)) entry.delete();
    }
  }
}
