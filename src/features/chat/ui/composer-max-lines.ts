import { appChatComposer } from "@/core/theme/tokens";

/**
 * C15 (task-coord-device-acceptance, RUN_ID 8447a0dd-3b1d-48cd-875a-797dde29aa9b):
 * derives the SwiftUI composer field's max visible line count from the
 * actual capsule/field code, so the field never grows past the fixed 120pt
 * capsule cap at large Dynamic Type sizes (reproduced at AX2, fontScale
 * ~2.14, iOS 26.5 simulator / iPhone 17 Pro). At the default text size the
 * field already fit 5 lines inside the cap; at AX sizes 5 lines of scaled
 * text grew far taller than the cap, and the SwiftUI host was not clipped
 * to the RN capsule, so the text spilled above it instead of scrolling
 * inside the field.
 *
 * Grounded constants (not assumed):
 * - `CAP` = `appChatComposer.maxHeight` (120, `tokens.ts:80`) -- the
 *   capsule's fixed `maxHeight` around the field
 *   (`chat-composer.ios.tsx:249`).
 * - `VERTICAL_PADDING` = 0. The capsule sets only `paddingHorizontal:
 *   appSpacing.sm` around the field and no `paddingVertical`
 *   (`chat-composer.ios.tsx:243-253`), and the field's own `Host` sets no
 *   padding either (`chat-composer-field.ios.tsx:60-64`, only
 *   `matchContents`/`alignSelf`) -- there is no coded vertical inset to
 *   subtract.
 * - `BASE_LINE_HEIGHT` = 22. The `TextField`'s `modifiers` array
 *   (`chat-composer-field.ios.tsx:67-70`, pre-fix) carries only
 *   `accessibilityLabel` and `lineLimit` -- no `.font` modifier -- so the
 *   field renders with SwiftUI's default text style for `TextField`, the
 *   system Body style. Apple's Human Interface Guidelines Dynamic Type size
 *   table defines Body as 17pt point size / 22pt line height at the default
 *   (fontScale 1) content size category.
 *
 *   availableHeight = CAP - VERTICAL_PADDING = 120 - 0 = 120
 *   composerMaxLines(scale) =
 *     clamp(floor(availableHeight / (BASE_LINE_HEIGHT * scale)), 1, 5)
 *
 *   scale 1    -> floor(120 / 22)          = floor(5.4545…) = 5 -> clamp -> 5
 *   scale 2.14 -> floor(120 / (22 * 2.14)) = floor(2.5488…) = 2 -> clamp -> 2
 *   scale 3.57 -> floor(120 / (22 * 3.57)) = floor(1.5278…) = 1 -> clamp -> 1
 *
 * fontScale 1 already floors to 5 with these grounded constants, so no
 * override is needed to preserve the unchanged-at-1x behavior. The
 * `Math.min(..., COMPOSER_LINE_LIMIT_MAX)` clamp is kept regardless, as an
 * explicit ceiling rather than relying on that arithmetic result alone.
 */
const CAP = appChatComposer.maxHeight;
const VERTICAL_PADDING = 0;
const BASE_LINE_HEIGHT = 22;
export const COMPOSER_LINE_LIMIT_MIN = 1;
export const COMPOSER_LINE_LIMIT_MAX = 5;

export function composerMaxLines(fontScale: number): number {
  const availableHeight = CAP - VERTICAL_PADDING;
  const lines = Math.floor(availableHeight / (BASE_LINE_HEIGHT * fontScale));
  return Math.max(
    COMPOSER_LINE_LIMIT_MIN,
    Math.min(COMPOSER_LINE_LIMIT_MAX, lines),
  );
}
