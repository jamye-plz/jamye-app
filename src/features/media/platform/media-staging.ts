import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

import { MAX_VIDEO_BYTES } from "@/features/media/model/media-policy";
import type { MediaFileCleanupPort } from "@/features/media/model/media-upload-ports";

import { createShareHoldRegistry } from "./file-share-holds";
import { statMediaFile } from "./media-file-stat";

const STAGING_DIR_NAME = "media-staging";
const SAFE_NAME_PATTERN = /[^A-Za-z0-9._-]+/g;

const shareHoldRegistry = createShareHoldRegistry((uri) => {
  const file = new File(uri);
  if (file.exists) file.delete();
});

function sanitizeFilename(candidate: string | null): string {
  const base = (candidate ?? "").split(/[/\\]/).pop() ?? "";
  const safe = base.replace(SAFE_NAME_PATTERN, "_").slice(0, 120);
  return safe.length > 0 ? safe : "media";
}

function stagingDirectory(create: boolean): Directory {
  const directory = new Directory(Paths.cache, STAGING_DIR_NAME);
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

export function isOwnedStagedFile(uri: string): boolean {
  return isCanonicalDirectChild(uri, stagingDirectory(false));
}

/**
 * Allocates an app-owned staging destination ahead of writing bytes into it (mirrors
 * `allocateDownloadDestination`). The returned `File` does not exist on disk yet.
 */
export function allocateStagingDestination(
  input: Readonly<{ filename: string | null }>,
): File {
  const directory = stagingDirectory(true);
  const name = `${randomUUID()}-${sanitizeFilename(input.filename)}`;
  return new File(directory, name);
}

/** Retain a staged file until its native owner (e.g. a thumbnail generator) releases it. */
export function retainStagedFile(uri: string): () => void {
  if (!isOwnedStagedFile(uri)) throw new Error("invalid_staged_file");
  return shareHoldRegistry.retain(uri);
}

export type StagedFile = Readonly<{
  uri: string;
  byteSize: number;
}>;

/**
 * Copies a picker-returned file into an app-owned staging location so upload can read
 * a stable path independent of the OS picker's own temp lifetime. The picker's source
 * file is never modified or deleted — only this staged copy is ever cleaned up.
 */
export async function stageOwnedCopy(
  input: Readonly<{ sourceUri: string; suggestedName: string | null }>,
): Promise<StagedFile> {
  const sourceStat = statMediaFile(input.sourceUri);
  if (!sourceStat.exists || sourceStat.byteSize <= 0) {
    throw new Error("Selected media file is missing or empty.");
  }
  if (sourceStat.byteSize > MAX_VIDEO_BYTES) {
    throw new Error("Selected media file exceeds the maximum staging size.");
  }

  const directory = stagingDirectory(true);
  const name = `${randomUUID()}-${sanitizeFilename(input.suggestedName)}`;
  const destination = new File(directory, name);
  const source = new File(input.sourceUri);
  try {
    await source.copy(destination);
    const copied = statMediaFile(destination.uri);
    if (
      !copied.exists ||
      copied.byteSize <= 0 ||
      copied.byteSize > MAX_VIDEO_BYTES ||
      copied.byteSize !== sourceStat.byteSize
    ) {
      throw new Error("Staged media copy size did not match its source.");
    }
    return { uri: copied.uri, byteSize: copied.byteSize };
  } catch (error) {
    try {
      removeStagedFile(destination.uri);
    } catch {
      // Preserve the original staging failure after attempting owned cleanup.
    }
    throw error;
  }
}

/** Deletes one previously staged file. Safe to call on an already-removed file. */
export function removeStagedFile(uri: string): void {
  try {
    if (!isOwnedStagedFile(uri)) return;
    shareHoldRegistry.releaseOrDefer(uri);
  } catch {
    // Best effort under filesystem races; the next account/startup sweep retries.
  }
}

/** Wipes the whole owned staging directory: startup sweep, account change, logout. */
export function cleanupAllStagedFiles(): void {
  const directory = stagingDirectory(false);
  if (directory.exists) directory.delete();
}

/** Native implementation of the model-tier `MediaFileCleanupPort`. Only ever deletes
 * files under this owned staging directory, never a picker's original source file. */
export function createNativeMediaFileCleanupPort(): MediaFileCleanupPort {
  return {
    async deleteIfExists(uri) {
      removeStagedFile(uri);
    },
  };
}
