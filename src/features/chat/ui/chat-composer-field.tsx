/**
 * Generic (non-platform-suffixed) fallback for `tsc`'s bare-import
 * resolution only -- `tsconfig` has no `moduleSuffixes`, so a bare
 * `"./chat-composer-field"` import (this module never bare-imports itself;
 * see the `.ios.tsx` / `.android.tsx` siblings) only typechecks if a
 * non-suffixed `chat-composer-field.tsx` exists alongside them. Metro and
 * Jest always resolve the platform-suffixed file first, so this module never
 * actually renders on-device or under test; it simply re-exports the RN
 * fallback (same pattern as `nickname-edit-screen.tsx` / `account-screen.tsx`).
 */
export { ChatComposerField } from "./chat-composer-field-fallback";
export type {
  ChatComposerFieldHandle,
  ChatComposerFieldProps,
} from "./chat-composer-field.types";
