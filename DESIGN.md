# Jamye App Design System

## 1. Visual Theme & Atmosphere

Jamye is a warm private conversation space for close friends. The M5 surface keeps attention on one Korean text conversation: a warm paper canvas, quiet neutral incoming messages, berry outgoing messages, and restrained rounded geometry. The interface should feel friendly without turning chat reliability into decoration.

This is a native mobile system. It respects iOS and Android keyboard, safe-area, type-scaling, and accessibility conventions instead of copying the web layout. Light and dark modes share the same low-chroma identity but use separately authored palettes. System status is explicit, calm, and readable.

The design posture is mostly symmetric, mostly static, and comfortably dense. Message flow and draft stability take precedence over ornamental motion. The sole continuous spatial transition is the conversation following system-owned keyboard progress.

## 2. Color Palette & Roles

### Light Palette

- Warm Paper Canvas (#FAF8F4): screen background and conversation canvas
- Clean Raised Surface (#FFFFFF): incoming messages, composer, and raised controls
- Quiet Warm Surface (#F5F1EC): disabled or secondary areas
- Ink Plum (#29252D): primary text on light neutral surfaces
- Muted Plum (#665F6B): metadata and secondary text
- Structural Mauve (#918693): control outlines and focus-adjacent component boundaries
- Warm Divider (#E8E0D8): separators that do not carry interaction meaning
- Conversation Berry (#9B3F68): outgoing messages and the single primary action role
- Clean On-Berry (#FFFFFF): text and symbols on Conversation Berry
- Clear Red (#B33C48): error text and failed state emphasis
- Butter Notice (#FBF3D6): local-fixture notice surface

### Dark Palette

- Deep Plum Canvas (#1C1920): screen background and conversation canvas
- Raised Night (#252129): incoming messages, composer, and raised controls
- Quiet Violet Surface (#302A42): disabled or secondary areas
- Moon Ink (#F4EEF2): primary text on dark neutral surfaces
- Muted Moon (#A9A0AE): metadata and secondary text
- Structural Lavender (#776D7C): control outlines and focus-adjacent component boundaries
- Night Divider (#322C36): separators that do not carry interaction meaning
- Petal Berry (#E39BB8): outgoing messages and the single primary action role
- Deep Berry Ink (#2C141F): text and symbols on Petal Berry
- Soft Error Pink (#F2A0A8): error text and failed state emphasis
- Night Butter (#3D351F): local-fixture notice surface

### State Rules

- `전송 중`, `전송 실패`, and `전송됨` are always rendered as text and exposed to accessibility APIs.
- Clear Red or Soft Error Pink may emphasize `전송 실패`, but color never replaces the label.
- The M5 screen has no connection color, connection badge, or connection announcement.
- Conversation Berry or Petal Berry is the only accent. Do not add a second accent for loading, retry, or success.

## 3. Typography Rules

Font family: React Native platform system font with Korean-capable platform fallback. M5 does not add a custom font asset. iOS may resolve to San Francisco and Apple SD Gothic Neo; Android may resolve to Roboto and Noto Sans KR. The platform remains authoritative.

| Role                | Font            |            Size | Weight | Line Height | Letter Spacing | Features                        | Notes                       |
| ------------------- | --------------- | --------------: | -----: | ----------: | -------------: | ------------------------------- | --------------------------- |
| Main heading        | Platform system | 24px equivalent |    700 |        32px |        -0.48px | Normal                          | One accessible main heading |
| Message             | Platform system | 16px equivalent |    400 |        1.55 |              0 | Natural Korean wrapping         | Never truncate message text |
| Body and notice     | Platform system | 16px equivalent |    400 |        26px |              0 | Normal                          | Minimum mobile body size    |
| Control label       | Platform system | 14px equivalent |    600 |        20px |              0 | Normal                          | Retry and send controls     |
| Timestamp and state | Platform system | 13px equivalent |    500 |        19px |              0 | Tabular numerals when available | Never below 13px equivalent |

Korean body, message, input, and control copy use natural tracking. Font scaling remains enabled. The 120px composer growth cap must not clip scaled text; internal scrolling begins only after the measured content exceeds the cap.

## 4. Component Stylings

### Screen and Main Heading

- The screen uses the semantic canvas color and platform safe-area insets.
- System status-bar icons and text use dark content on Warm Paper Canvas and light content on Deep Plum Canvas.
- Set system-bar content contrast only. Do not force a separate status-bar background or translucent overlay.
- Content is fluid and centered with a maximum width of 720px equivalent.
- Compact horizontal gutters are 16px. Wide gutters are 24px.
- The main heading uses the main-heading type role and receives initial accessibility focus once on route entry.

### Local Fixture Notice

- Use Butter Notice in light mode and Night Butter in dark mode.
- Use 16px body text with Ink Plum or Moon Ink.
- Keep the established exact non-production notice copy.
- The notice appears after the heading and before the message region in visual and accessibility order.

### Message Region and Pagination

- The region accessibility name is `채팅 메시지`.
- Use a non-inverted list in chronological order.
- Before the first bounded message page resolves, expose the polite loading
  text `메시지 불러오는 중...`.
- If that first page fails, expose alert text
  `메시지를 불러오지 못했습니다.` and a button named
  `메시지 다시 불러오기`; retry the same newest-page query only once at a
  time.
- A successful first page with no rows is distinct from failure and shows
  `아직 메시지가 없습니다.`.
- A failed later refresh retains the existing message rows without replacing
  them with an empty or error surface.
- Older-page loading is attached to the top edge.
- Loading copy is `이전 메시지 불러오는 중...`.
- Failure recovery is a control named `이전 메시지 다시 불러오기`.
- Prepending older rows retains the first visible message anchor and does not animate scroll position.
- Keyboard appearance and dismissal move the frame and message-list anchor from the same native progress signal on both platforms.
- During that transition, the latest visible message remains directly above the composer at the lower visible boundary. Do not synthesize keyboard timing with JavaScript timers or stepped layout-event corrections.
- Only a locally committed message requests a post-layout reveal. Incoming messages and unchanged repository notifications never force the reader to the bottom.

### Message Bubbles

- Incoming bubbles use Clean Raised Surface or Raised Night with primary text.
- Outgoing bubbles use Conversation Berry with Clean On-Berry in light mode, and Petal Berry with Deep Berry Ink in dark mode.
- Maximum width is 78% on compact widths and 66% from 768px equivalent.
- Radius is 20px with one 8px conversation-side corner. Do not add tails or arrows.
- Same-sender rows use a 4px gap. Sender changes use a 12px gap.
- Bubbles use elevation 0. Shape, alignment, and color provide grouping.
- Message text is 16px equivalent at 1.55 line height.
- Timestamp and state text are 13px equivalent.

### Send State and Retry

- Pending is `전송 중`.
- Failed is `전송 실패` and exposes a separate retry control named `메시지 다시 보내기`.
- Sent is `전송됨`.
- The retry control uses the existing message identity. It must not look like a new send action.
- A repository notification that leaves state unchanged does not repeat a live announcement.

### Composer

- Use a multiline native text input with accessibility name `메시지 입력`.
- Minimum height is 48px. Growth cap is 120px equivalent, adjusted safely for font scaling.
- Radius is 16px. Use the raised surface and semantic structural border.
- Focus changes the existing border to the primary role and adds a stable inset emphasis. It does not move layout.
- Enter or Return inserts a newline. `onSubmitEditing`, key press, and composition events never send.
- Draft text remains intact during Korean IME composition and after a failed database write.
- A successful explicit send clears the committed draft but preserves input focus and keeps the keyboard open.
- The platform keyboard frame owns keyboard overlap and bottom-safe-area normalization; the composer stays immediately above that frame.

### Send Control

- The control has a minimum target of 44x44 points and a 16px radius.
- The exact visible label and accessibility name is `메시지 보내기`.
- It is disabled for empty, whitespace-only, or in-flight input.
- Only this explicit control sends.
- Press feedback completes within 150ms using opacity or transform without changing layout. Reduced-motion mode keeps immediate non-spatial feedback.

## 5. Layout Principles

### Spacing System

Use the existing 4px and 8px-derived scale: 4, 8, 12, 16, 20, 24, 32, 40, and 48. The 4px and 12px chat-group gaps are intentional semantic values.

### Container and Flow

- Conversation maximum width: 720px equivalent
- Compact gutter: 16px
- Wide gutter: 24px
- Order: main heading, local-fixture notice, older-page state, message region, composer, send action
- The list fills remaining height while the composer remains reachable above the keyboard. Its lower visible boundary follows the same native keyboard progress and lands at the same resting offset when the keyboard closes.
- Do not use an inverted list, fixed desktop width, nested cards, or a separate context rail in M5.

### Radius Scale

- 8px: message directional corner and compact inner geometry
- 12px: compact secondary controls
- 16px: composer and buttons
- 20px: message bubbles
- 24px: large notices or future sheets only
- Full radius: true circular controls only

## 6. Depth & Elevation

- Elevation 0: page, message bubbles, list content
- Elevation 1: local-fixture notice when separation is needed
- Elevation 2: composer boundary only when a platform needs separation from scrolling content
- Shadows are subtle, single-source, and top-down. Prefer a divider or surface change over a shadow.
- Do not use glassmorphism, blur, inner clay shadows, or floating decorative layers.
- Base content uses the normal stacking context. The keyboard and platform system UI remain outside application z-index ownership.

## 7. Do's and Don'ts

- DO: Keep Conversation Berry or Petal Berry as the one accent.
- DON'T: Add blue, teal, or gradient accents for loading or success.
- DO: Render every send state as exact Korean text.
- DON'T: Convey pending, failed, or sent state with color alone.
- DO: Let Enter and Return create newlines and preserve Korean IME composition.
- DON'T: bind key press, submit editing, or composition completion to send.
- DO: Retain the visible anchor when older messages are prepended.
- DON'T: invert the list or animate scroll correction.
- DO: Move the latest-message lower boundary continuously with native keyboard progress.
- DON'T: issue repeated JavaScript layout-event scrolls or guess the platform keyboard duration.
- DO: Keep input focus and the keyboard after a committed send, then reveal the committed row once native layout has settled.
- DON'T: dismiss the keyboard or force-scroll for an incoming message.
- DO: Author light and dark roles independently.
- DON'T: mechanically invert the light palette.
- DO: Use the platform system font and allow system scaling.
- DON'T: add a font dependency or shrink chat text below 16px equivalent.
- DO: Keep controls at least 44x44 points.
- DON'T: add independent decorative animation to composer height, safe area, or message placement; keyboard-driven movement must remain locked to the system transition.
- DO: Use plain functional Korean copy.
- DON'T: reuse M6 connection retry copy `다시 시도` for message or pagination recovery.
- DO: Keep the M5 screen focused on text chat.
- DON'T: reserve empty space for media, microphone, connection, auth, or server features.

## 8. Responsive Behavior

### Compact Mobile: 320px to 767px Equivalent

- Use the full available width with 16px horizontal gutters.
- Bubbles are at most 78% of the conversation width.
- Keep one vertical reading path and no secondary rail.
- Composer and send control remain above the keyboard and bottom safe area.
- The latest visible message remains directly above the composer throughout keyboard appearance and dismissal, not only after the final layout.
- All interactive targets are at least 44x44 points.

### Tablet: 768px and Above

- Center the conversation and allow 24px gutters.
- Bubbles are at most 66% of the conversation width.
- Keep the same reading order and interaction model as mobile.
- Do not add a desktop-only panel merely because space is available.

### Wide Native or Web Preview: 1024px and Above

- Keep the conversation capped at 720px equivalent.
- The surrounding canvas may expand, but message line length and composer width do not.
- No horizontal scroll is allowed at any supported width.

### Accessibility and Platform Adaptation

- Support 200% text without hiding status or controls.
- VoiceOver and TalkBack order is heading, notice, messages, composer, send action.
- Keep state meaning when reduced motion is enabled.
- Verify system status-bar content remains legible against the active light or dark canvas on both platforms.
- Shared components own copy, semantics, tokens, and the lower-boundary anchor rule. Platform wrappers expose native keyboard progress and normalize settled safe-area overlap.
- Native acceptance on both platforms is required for keyboard, IME, anchor, dark mode, large text, and screen-reader behavior.

## 9. Agent Prompt Guide

### Quick Color Reference

- Light canvas: Warm Paper Canvas (#FAF8F4)
- Light incoming surface: Clean Raised Surface (#FFFFFF)
- Light outgoing surface: Conversation Berry (#9B3F68)
- Light outgoing text: Clean On-Berry (#FFFFFF)
- Light primary text: Ink Plum (#29252D)
- Light secondary text: Muted Plum (#665F6B)
- Light error: Clear Red (#B33C48)
- Dark canvas: Deep Plum Canvas (#1C1920)
- Dark incoming surface: Raised Night (#252129)
- Dark outgoing surface: Petal Berry (#E39BB8)
- Dark outgoing text: Deep Berry Ink (#2C141F)
- Dark primary text: Moon Ink (#F4EEF2)
- Dark secondary text: Muted Moon (#A9A0AE)
- Dark error: Soft Error Pink (#F2A0A8)

### Example Component Prompts

1. "Build the React Native chat screen on #FAF8F4 light or #1C1920 dark canvas. Center one fluid conversation column capped at 720 points equivalent, with 16-point compact gutters and 24-point wide gutters. Order the accessible main heading, exact local-fixture notice, non-inverted message list, and bottom-safe-area composer."
2. "Build a React Native message bubble. Incoming uses #FFFFFF light or #252129 dark. Outgoing uses #9B3F68 with #FFFFFF text in light mode and #E39BB8 with #2C141F text in dark mode. Use 16-point text at 1.55 line height, 20-point radius with one 8-point conversation-side corner, 78% compact and 66% wide maximum width, 4-point same-sender gaps, and 12-point sender-change gaps."
3. "Build a non-inverted React Native message list with accessibility name `채팅 메시지`. Load older pages at the top edge, show `이전 메시지 불러오는 중...`, expose failure action `이전 메시지 다시 불러오기`, and retain the first visible anchor after prepend without animated correction."
4. "Build a multiline React Native composer on #FFFFFF light or #252129 dark with a semantic border, 48-point minimum height, 120-point growth cap, and 16-point radius. Accessibility name is `메시지 입력`. Enter inserts a newline. Only the explicit send control submits. Preserve Korean IME composition and input focus after commit. Drive the frame and latest-message anchor from the same native keyboard progress, normalized for bottom safe area."
5. "Build the send-state row with exact visible and accessibility text: pending `전송 중`, failed `전송 실패`, sent `전송됨`. Failed messages expose `메시지 다시 보내기`. Never use color alone and never reuse connection action `다시 시도`. Announce only actual state transitions."
6. "Build the explicit send control with exact visible and accessibility label `메시지 보내기`, minimum 44x44-point target, 16-point radius, primary semantic color, and at most 150ms opacity or transform press feedback. Disable it for empty, whitespace-only, or in-flight input and avoid layout shift."

### Iteration Guide

1. Preserve one accent, the berry primary role, across all interaction states.
2. Use the existing independently authored light and dark semantic tokens. Never invert colors mechanically, and match system-bar content to the active canvas contrast.
3. Keep the radius ladder at 8, 12, 16, 20, and 24 points with full radius only for true circles.
4. Keep Korean message and input text at 16 points equivalent or larger and preserve system scaling.
5. Treat newline behavior, IME composition, draft persistence, and scroll anchoring as correctness, not visual polish.
6. Use exact state and retry copy. Do not merge message, pagination, and connection recovery intents.
7. Do not approximate keyboard correction with JavaScript layout steps, delays, or guessed durations. Keep the latest-message anchor synchronized to native keyboard progress and reserve post-layout animated reveal for a locally committed row.
8. Keep M5 free of media, microphone, connection, auth, server, and decorative asset placeholders.
