import { requireNativeModule } from "expo";
import type {
  ImageManipulatorContext,
  ImageRef,
  ImageResult,
  SaveFormat,
} from "expo-image-manipulator";

type NativeImageManipulator =
  typeof import("expo-image-manipulator").ImageManipulator;

/**
 * Lazy loading keeps existing supported-file flows usable until a dev build
 * has been rebuilt with this native dependency. No network fallback exists.
 * Same native entry point as Expo's public JS wrapper, loaded on demand like
 * native-file-put.ts. Types stay tied to the pinned SDK package.
 */
function loadImageManipulator(): NativeImageManipulator {
  return requireNativeModule<NativeImageManipulator>("ExpoImageManipulator");
}

export type RenderedJpeg = Readonly<{
  /** The saved JPEG: a file in the native manipulator's cache directory. */
  result: ImageResult;
  /**
   * Releases the rendered image, then the context. The context is released
   * even when releasing the image throws; that error is then rethrown.
   */
  release: () => void;
}>;

export type RenderJpegOptions = Readonly<{
  compress: number;
  /** Chains edit steps (crop, resize, ...) onto the context before rendering. */
  transform?: (context: ImageManipulatorContext) => ImageManipulatorContext;
}>;

function releaseRendered(
  image: ImageRef | undefined,
  context: ImageManipulatorContext,
): void {
  try {
    image?.release();
  } finally {
    context.release();
  }
}

/**
 * Decodes `uri` on native threads, applies `transform`, and saves a JPEG
 * (never base64). The caller owns `release` and the saved output file. On a
 * failure while rendering or saving, everything created so far is released
 * before the error is rethrown.
 */
export async function renderJpeg(
  uri: string,
  { compress, transform }: RenderJpegOptions,
): Promise<RenderedJpeg> {
  const context = loadImageManipulator().manipulate(uri);
  let image: ImageRef | undefined;
  try {
    image = await (transform ? transform(context) : context).renderAsync();
    const rendered = image;
    const result = await rendered.saveAsync({
      format: "jpeg" as SaveFormat,
      compress,
      base64: false,
    });
    return { result, release: () => releaseRendered(rendered, context) };
  } catch (error) {
    releaseRendered(image, context);
    throw error;
  }
}
