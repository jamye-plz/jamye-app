import { composerMaxLines } from "../../../src/features/chat/ui/composer-max-lines";

/**
 * C15 (task-coord-device-acceptance, RUN_ID 8447a0dd-3b1d-48cd-875a-797dde29aa9b):
 * reproduced on the iOS 26.5 simulator (iPhone 17 Pro) at Dynamic Type
 * `accessibility-large` (AX2, RN `fontScale` ~2.14) -- a long single-line
 * group-chat draft wraps to ~5 lines and spills ABOVE the composer capsule
 * instead of scrolling inside it, because `chat-composer-field.ios.tsx`
 * capped the SwiftUI field's `lineLimit` to a fixed `1...5` range regardless
 * of Dynamic Type scale, and five lines of AX-scaled text is far taller than
 * the capsule's fixed 120pt cap (`appChatComposer.maxHeight`).
 *
 * `composerMaxLines` (`src/features/chat/ui/composer-max-lines.ts`) derives
 * the max visible line count from three constants grounded in the actual
 * capsule/field code (not assumed):
 * - cap = 120, `appChatComposer.maxHeight` (`tokens.ts:80`), the capsule's
 *   `maxHeight` (`chat-composer.ios.tsx:249`).
 * - verticalPadding = 0: the capsule sets only `paddingHorizontal` around
 *   the field, no `paddingVertical` (`chat-composer.ios.tsx:243-253`), and
 *   the field's `Host` sets no padding either
 *   (`chat-composer-field.ios.tsx:60-64`).
 * - baseLineHeight = 22: the field's `TextField` sets no `.font` modifier
 *   (`chat-composer-field.ios.tsx:67-70`, pre-fix), so it renders with
 *   SwiftUI's default Body text style, which Apple's HIG Dynamic Type table
 *   defines as 17pt / 22pt line height at fontScale 1.
 *
 *   availableHeight = cap (120) - verticalPadding (0) = 120
 *   composerMaxLines(scale) =
 *     clamp(floor(availableHeight / (baseLineHeight(22) * scale)), 1, 5)
 *
 *   scale 1    -> floor(120 / 22)          = floor(5.4545…) = 5 -> clamp -> 5
 *   scale 2.14 -> floor(120 / (22 * 2.14)) = floor(2.5488…) = 2 -> clamp -> 2
 *   scale 3.57 -> floor(120 / (22 * 3.57)) = floor(1.5278…) = 1 -> clamp -> 1
 *
 * fontScale 1 already floors to 5 with these grounded constants (no
 * override needed to preserve unchanged-at-1x behavior). At AX2 this caps
 * the field at 2 visible lines -- well within the 120pt cap at that scale --
 * and the SwiftUI `TextField(axis: .vertical)` scrolls internally past the
 * limit instead of growing past it, which is the existing
 * `COMPOSER_LINE_LIMIT_RANGE` pattern's own documented iOS behavior (see
 * `chat-composer-field.ios.tsx`'s `lineLimit` comment).
 *
 * GREEN (Stage B): `composer-max-lines.ts` now implements this function;
 * see that file for the authoritative grounded constants and arithmetic.
 */
describe("C15 composerMaxLines (fontScale-aware composer line cap)", () => {
  test("returns 5 at fontScale 1 -- unchanged from the prior fixed 1...5 cap", () => {
    expect(composerMaxLines(1)).toBe(5);
  });

  test("returns 2 at fontScale ~2.14 -- the reproduced AX2 large-text scale", () => {
    expect(composerMaxLines(2.14)).toBe(2);
  });

  test("returns 1 at fontScale ~3.57 -- near-max accessibility scale, clamped at the floor", () => {
    expect(composerMaxLines(3.57)).toBe(1);
  });

  test("clamps to the 1...5 range outside normal Dynamic Type scales", () => {
    expect(composerMaxLines(0.01)).toBe(5);
    expect(composerMaxLines(100)).toBe(1);
  });
});
