import type { ImageLoadEventData } from "expo-image";

/** Pixel size of a loaded image or video thumbnail. */
export type MediaPixelSize = Readonly<{ width: number; height: number }>;

/** Adapts an `expo-image` `onLoad` to a size callback, skipping empty sizes. */
export function reportPixelSize(
  onPixelSize: ((size: MediaPixelSize) => void) | undefined,
) {
  if (!onPixelSize) return undefined;
  return ({ source }: ImageLoadEventData) => {
    if (source.width > 0 && source.height > 0)
      onPixelSize({ width: source.width, height: source.height });
  };
}
