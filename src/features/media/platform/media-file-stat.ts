import { File } from "expo-file-system";

export type MediaFileStat = Readonly<{
  exists: boolean;
  byteSize: number;
  uri: string;
}>;

/**
 * Reads the actual on-disk size of a picked/staged file. Picker-reported `fileSize`
 * values are a hint, not authoritative — this re-checks the real file before it is
 * validated against `media-policy.ts` or handed off for upload.
 */
export function statMediaFile(uri: string): MediaFileStat {
  const file = new File(uri);
  return {
    exists: file.exists,
    byteSize: file.exists ? file.size : 0,
    uri: file.uri,
  };
}
