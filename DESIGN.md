# Jamye App Design System

## 1. Visual Theme & Atmosphere

Jamye is a warm private conversation space for close friends. The M5 surface keeps attention on one Korean text conversation: a warm paper canvas, quiet neutral incoming messages, berry outgoing messages, and restrained rounded geometry. The interface should feel friendly without turning chat reliability into decoration.

This is a native mobile system. It respects iOS and Android keyboard, safe-area, type-scaling, and accessibility conventions instead of copying the web layout. Navigation chrome is drawn by the platform: Liquid Glass on iOS 26 and Material 3 on Android (ADR 0010); neither platform wears the other's uniform. Light and dark modes share the same low-chroma identity but use separately authored palettes. System status is explicit, calm, and readable.

The design posture is mostly symmetric, mostly static, and comfortably dense. Message flow and draft stability take precedence over ornamental motion. The sole continuous spatial transition is the conversation following system-owned keyboard progress.

## 2. Color Palette & Roles

### Neutral Roles (Platform Semantic)

Neutral surface, text, and structural roles come from the platform, never from a brand hex (ADR 0011). iOS uses `PlatformColor` UIKit dynamic colors. Android uses a fixed Material 3 tonal palette generated from the Conversation Berry seed (#9B3F68) with material-color-utilities, not the wallpaper-driven dynamic color, so the app looks the same on every device and Compose hosts can receive plain hex. The authored fallback hex applies only where neither platform is present (web preview, tests).

| Role                                 | iOS UIKit (`PlatformColor`) | Android Berry-seed M3 (light / dark) | Fallback hex (light / dark) |
| ------------------------------------ | --------------------------- | ------------------------------------ | --------------------------- |
| Canvas (`background`)                | `systemBackground`          | #FFF8F8 / #120D0E                    | #FAF8F4 / #1C1920           |
| Raised surface (`surface`)           | `secondarySystemBackground` | #F7EBED / #241E20                    | #FFFFFF / #252129           |
| Quiet surface (`surfaceMuted`)       | `systemFill`                | #F1E5E7 / #2E282A                    | #F5F1EC / #302A42           |
| Primary text (`text`)                | `label`                     | #201A1C / #EBE0E2                    | #29252D / #F4EEF2           |
| Secondary text (`textMuted`)         | `secondaryLabel`            | #514347 / #D5C2C7                    | #665F6B / #A9A0AE           |
| Tertiary text (`textTertiary`)       | `tertiaryLabel`             | #837377 / #9D8C91                    | #918693 / #776D7C           |
| Structural outline (`border`)        | `separator`                 | #837377 / #9D8C91                    | #918693 / #776D7C           |
| Divider (`divider`)                  | `separator`                 | #D5C2C7 / #514347                    | #E8E0D8 / #322C36           |
| Error (`error`)                      | `systemRed`                 | #BA1A1A / #FFB4AB                    | #B33C48 / #F2A0A8           |
| Accent container (`accentContainer`) | `secondarySystemFill`       | #FFD9E4 / #5A3F49                    | #FFD9E4 / #5A3F49           |

Android resolves the light or dark spec from the active app color scheme. `@expo/ui` Compose hosts take `seedColor={colors.primary}` so their Material palette derives from the same seed.

### Accent, Error, and Notice

- Conversation Berry (#9B3F68, light) and Petal Berry (#E39BB8, dark) are the single highlight color (ADR 0011 D1). They appear only on: the active tab icon and label, filled primary buttons and the send control, text action buttons, the focused input border, unread dots, selected chips and row titles, and outgoing message bubbles.
- Clean On-Berry (#FFFFFF, light) and Deep Berry Ink (#2C141F, dark): text and symbols on the Berry surfaces above.
- Everything else that is not a highlight, including header tint, header and in-content icon buttons, list leading icons and chevrons, refresh spinners, activity indicators, and section titles, uses the platform label colors (`text`, `textMuted`) or the platform default.
- Clear Red (#B33C48): error text and failed state emphasis (light mode)
- Soft Error Pink (#F2A0A8): error text and failed state emphasis (dark mode)
- Butter Notice (#FBF3D6): local-fixture notice surface (light mode)
- Night Butter (#3D351F): local-fixture notice surface (dark mode)

### State Rules

- `전송 중`, `전송 실패`, and `전송됨` are always rendered as text and exposed to accessibility APIs.
- Clear Red or Soft Error Pink may emphasize `전송 실패`, but color never replaces the label.
- Sync status is exposed as header subtitle text only; it still carries no connection color or connection badge.
- Conversation Berry or Petal Berry is the only accent and only for highlights. Do not add a second accent for loading, retry, or success, and do not tint static glyphs with it.

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

### M14 Native UI Principles

M14 screens keep the native visual language as the first design constraint: iOS follows HIG and
Liquid Glass for navigation chrome, sheets, forms and bar items; Android follows Material 3 for
top bars, dialogs, FABs, menus, chips and list affordances. Shared copy, state meaning and data
contracts stay common, but a screen must not force one platform's visible pattern onto the other.

Component selection follows this order:

1. Use `@expo/ui` universal components first (`Host`, `List`, `ListItem`, `BottomSheet`, `Button`,
   `Text`, `Icon`, `Column`, `Row`, native refresh where available).
2. If the universal layer cannot express a platform-native behavior, use platform files with
   `@expo/ui/swift-ui` on iOS or `@expo/ui/jetpack-compose` on Android.
3. Use the local Expo module `jamye-ui` only for behavior missing from both layers: iOS
   `JamyeAvatarView` for async profile avatars and Android `JamyeDateChipRowView` for the
   reverse-layout Material date chip row.

React Native views remain acceptable for route glue, measured content inside `RNHostView`, and
fallbacks that have no native owner, but they are not the first choice for a user-visible control.
Interop rules found during M14 device verification are now part of the design contract:

- A `Host` that contains horizontally scrolling or flow content (`LazyRow`, carousel, `FlowRow`)
  uses `matchContents={{ vertical: true }}` so Compose is not measured with unbounded width.
- SwiftUI and Compose state views must render inside a `Host`; do not place expo-ui `Text`,
  `Column`, `ContentUnavailableView`-style blocks, or Material rows outside it.
- Every Android `Host` receives the Berry `seedColor`; without it the Material You wallpaper colors
  show through.
- Rows that appear and disappear inside a Compose `LazyColumn` use Compose `Text`, not React Native
  text, to avoid stale child ownership during pop/blur transitions.
- React Native content placed inside a native list row or carousel item is wrapped with `RNHostView`
  and given stable dimensions (`fillMaxSize`, row width, or explicit match contents).
- Android C3 input screens are full-screen dialogs that hide the Stack header and draw their own M3
  top bar. Link-opened C3 routes declare their modal options on the root `Stack`, not only inside
  the screen component.

M14 round 2 device verification (login, account, notifications, chat, composer, media, voice) added
the following interop rules:

- Every SwiftUI or Compose view — including a SwiftUI `Alert`, `ConfirmAlert`, or `Button` — renders
  inside its own `Host`; a view mounted outside a `Host` fails at the native boundary instead of
  degrading, which showed as a red error box on iOS device builds.
- Every Android `Host` receives the Berry `seedColor`, including a `Host` added for a single control;
  without it, the Material palette falls back to the wallpaper-driven Material You colors instead of
  the app's fixed Berry-seed palette.
- React Native content placed inside a Compose `LazyColumn` needs `RNHostView matchContents` together
  with an explicit width; missing either one leaves Compose re-measuring the RN subtree in a loop
  that pins the main thread and hangs the app.
- A Compose slot (a `ListItem` headline, a `TextField` placeholder, a menu item) accepts Compose
  content only, never a bare string or an embedded React Native view; and a React Native touchable
  nested inside a Compose tree (for example under a `DropdownMenu` trigger) receives no touches on
  device — give the control to Compose (`clickable`, `Icon`) or keep it in plain React Native outside
  the Compose trigger.
- An always-mounted full-screen Compose host blocks React Native hit-testing underneath it even when
  its RN wrapper sets `pointerEvents="box-none"`; mount such a host only while it is actually showing
  content, and size it to the band it needs (for example a bottom snackbar band), not the full
  screen.
- A `BadgedBox` with no `BadgedBox.Badge` child still draws a default badge, so render `BadgedBox`
  only when there is a badge to show; and a `Host`'s `onLayoutContent` fires only after the first
  Compose layout, so an imperative Compose host (for example `SnackbarHost`) rejects calls made
  before that first layout and callers must wait for it.
- `NativeButton`'s `Host` stretches to fill its parent even when the `Button` itself stays
  content-sized; to change a button's screen position or width, adjust the parent's alignment or
  size, not the button.
- The one-line input shells (`NativeInputSheet`, `NativeInputDialog`) seed the native field from
  `initialValue` only, read once on mount; a caller that instead threads the current text through
  `value` on every render leaves the native field empty, since re-renders never re-seed it.
- `expo-video`'s iOS `replaceAsync` resolves before the player item is actually attached; call
  `generateThumbnailsAsync` (or anything else that reads frames) only after the player reports
  `readyToPlay`, or it silently returns zero frames.
- The server stores no width or height for chat media; a message with a single photo or video
  therefore learns its aspect ratio from the loaded pixels once they decode, and a grid of more than
  one attachment stays square, since a mixed-ratio grid has no single ratio to prefer.

### Screen and Main Heading

- The screen uses the semantic canvas color and platform safe-area insets.
- System status-bar icons and text use dark content on Warm Paper Canvas and light content on Deep Plum Canvas.
- Set system-bar content contrast only. Do not force a separate status-bar background or translucent overlay.
- Content is fluid and centered with a maximum width of 720px equivalent.
- Compact horizontal gutters are 16px. Wide gutters are 24px.
- The native Stack header (`expo-router`'s `Stack.Screen`) owns the screen title; there is no separate in-content heading component.
- The group list and the group home use regular titles, so on iOS the title and the bar buttons share one compact bar row (a large title would push the `+` capsule into the row above it) and on Android the group name reads in the top app bar. Only the notifications inbox keeps a large title.
- Lists of rows with secondary actions (group list, topic list) share two components. `NativeList` is the scrollable, refreshable container: the universal `@expo/ui` `List` on iOS (SwiftUI `List` + `.refreshable`), and on Android a Compose `PullToRefreshBox` + `LazyColumn` composed with `fillMaxSize`, because the universal `List` wraps its content height and a pull below the last row would do nothing. `ActionListItem` is the row: a universal `ListItem` (headline, supporting text) whose tap runs the primary action and whose secondary actions surface the platform way. iOS: trailing `swipeActions` (destructive action at the edge, full swipe off) and a `contextMenu` on long press with the same items, plus a muted chevron. Android: long press or the trailing ⋮ icon button opens a Material 3 `DropdownMenu` (Material Symbols glyphs, error color for destructive items); there is no swipe, since Material reserves row swipe for one dismiss action. Empty, error and 더 보기 states are `Text`, `Icon`, `Column` and text `Button` rows inside the same list, so these screens own no React Native views besides the `Host`. Loading has no row of its own: the native pull-to-refresh indicator is the only loading signal. Secondary text uses the platform label color at reduced opacity; error text uses the platform red as hex (`resolveGroupListErrorColor`).
- Group row actions: an owner gets 초대 링크 공유 (creates a 7-day unlimited-use invite, then opens
  the system share sheet) and 소유권 이전 (a bottom sheet lists the other members; picking one asks
  for confirmation); everyone else gets 그룹 나가기 (destructive, confirmation required). The row
  actions reuse the group info screen's flows and close the opened group again when they settle.
- The top-level destinations are a three-item tab bar: 그룹 (`person.2` / `group`), 알림 (`bell` / `notifications`), 계정 (`person.crop.circle` / `account_circle`) via Expo Router `NativeTabs` (ADR 0009, ADR 0010): a `UITabBarController` in Liquid Glass on iOS 26 and a Material 3 navigation bar on Android. The active tab icon and label use Conversation Berry or Petal Berry. On iOS every other color, the indicator, and the minimize behavior stay the platform default; on Android the bar sits on `surface`, the active pill is `accentContainer`, and inactive icons and labels are `textMuted` (ADR 0011 D4). The notifications tab shows the unread count as a native badge, hidden at zero and capped at `99+`. Each tab owns its own native Stack so the rules above apply unchanged inside a tab.
- The chat screen and the create/join/new-topic modals live on the root Stack, so the tab bar is hidden while they are open.
- The group home is the topic list titled with the group name. The group list header keeps only the `+` menu. On the group home the title itself is a button (`HeaderTitleButton`: the group name plus a muted trailing chevron, rendered through `headerTitle` inside the native bar) that opens 그룹 정보; the bar actions are, left to right, 그룹 대화방 (`bubble.left.and.bubble.right` / `forum`) and 새 주제 (`plus` / `add`). There is no info icon, no in-content row for the group chatroom and no "서울 날짜" caption.
- Topic rows are `ActionListItem`s in a `NativeList`: tapping a row opens the topic's chatroom.
  They show the author's avatar, title, and supporting author/state/tag text. 상세 is reached from
  the chatroom title -> topic detail flow. Rows never show unread badges. The empty state appears
  only for a settled date with no topics, never beside rows.
- Topic delete (M15) is author-only and surfaces through three entry points: the topic detail
  header menu (iOS `…` / Android ⋮), the row's existing long-press/⋮ `ActionListItem` action (iOS
  context menu, Android dropdown), and an iOS swipe (Android has no row swipe, per the
  `ActionListItem` platform split above). A non-author row shows no delete action at all. Every
  entry point confirms through the shared `ConfirmAlert` (`주제를 삭제할까요?` /
  `주제 대화방의 메시지와 사진·동영상도 모든 사람에게서 삭제됩니다.`, destructive `삭제`) before
  anything is removed. On the topic row specifically, the iOS swipe action paints the system red
  tint instead of using SwiftUI's `role: .destructive`, because the destructive role runs its row-
  removal animation as soon as the swipe button is tapped — before the confirmation alert settles;
  the row's `contextMenu` (long press) keeps `role: .destructive`, since a context-menu item never
  pre-removes the row. A deleted topic's detail and chatroom both show a `삭제된 주제입니다.` state
  with no input box and no header menu; the list drops the row entirely. When the author deletes
  from the detail header menu, a successful delete navigates straight to the group's topic list
  (skipping the now-gone chatroom and detail); a failed delete stays on the detail and shows the
  error inline through the existing `TopicError`/`TOPICS_ERROR_MESSAGES` copy.
- The date picker on the group home is a horizontal native chip row. iOS uses SwiftUI horizontal
  scroll with Liquid Glass capsule buttons (`glassProminent` selected, `glass` otherwise;
  `borderedProminent` / `bordered` below iOS 26) and opens with today at the trailing edge. Android uses `jamye-ui`'s `JamyeDateChipRowView`: a
  reverse-layout Compose `LazyRow` of Material 3 `FilterChip`s, because `@expo/ui` 57 does not
  expose reverse layout or initial trailing index control. Labels are 오늘 / 어제 / localized dates,
  and the row contains 주제가 있는 날짜 plus today.
- The heading focus rule now targets the header title, or on the chat screen the header subtitle: it receives initial accessibility focus once on route entry.

### Native Header, Buttons, Sheets, Rows

- `HeaderActions` renders header actions per platform: native bar button items and pull-down menus through `Stack.Toolbar` on iOS (Liquid Glass capsules with the system glyph color on iOS 26), and `@expo/ui` Compose `IconButton`s plus Material 3 `DropdownMenu`s hosted in `headerRight` on Android (transparent button container, `text`-colored glyphs, icons from the Material vector drawables under `assets/icons/material/`). Header tint on both platforms is the label color, never Berry. Screens pass an action list and never draw header buttons themselves. Choices offered from a header button (그룹 추가 → 새 그룹 만들기 / 초대 코드로 가입) are menu items anchored to the button, not a bottom sheet. `HeaderIconButton` remains for in-content icon buttons. react-navigation's own theme follows the app color scheme (`resolveNavigationTheme`) with the platform canvas as `card`, so a regular-title iOS bar paints `systemBackground` in both modes instead of the library's light default.
- `NativeButton` wraps `@expo/ui`'s `Button` inside a `Host` and offers `filled`, `outlined`, and `text` variants, plus `busy`, `retryAt`, and `destructive` states.
- In-content action sheets and pickers use `@expo/ui`'s `BottomSheet` together with `List`/`ListItem`; option labels are wrapped in `@expo/ui`'s `Text`. Header-anchored choices use the native menu above instead.
- `GroupedSection`/`GroupedRow` render inset-grouped rows; the trailing chevron is iOS only.

### Login Screen

- The app name `잼얘좀` sits at the exact center of the screen (the whole window, not the space
  above the buttons), with the one-line subtitle `카카오 또는 Google 계정으로 로그인합니다.`
  hanging below it without moving it. Two full-width brand buttons (48pt tall, at most 440pt wide)
  are pinned just above the thumb-reachable bottom safe area: `카카오로 계속하기` (Kakao official
  style, `#FEE500` fill, the Kakao speech-bubble symbol, black label) and `Google로 계속하기`
  (Google official style, white fill, `#747775` outline, the Google "G" mark). iOS renders each as
  a capsule SwiftUI `Button` (size the frame before painting the capsule; the Google outline is a
  `strokeBorder` along the capsule); Android renders each as a rounded M3 `Button` (the Google
  outline is a 1dp ring around it — Compose's `border` modifier has no shape). Both use the
  vendors' official logo assets on a transparent background, centered together with the label like
  the official artwork: an 18pt "G" and a ~14pt Kakao symbol (asset sources in the M14 evidence).
- The pressed button shows an in-button spinner in the logo's slot, so the label does not shift
  (iOS `ProgressView`, Android `CircularProgressIndicator`), and both buttons disable while a
  sign-in is in flight. A
  user-initiated cancel (cancel, dismiss, `access_denied`) returns to the login screen with no
  notice. Any other failure — including session-restore, profile-retry, and logout-retry failures
  reusing the existing copy — shows through the shared system-feedback API (iOS centered `Alert`,
  Android `Snackbar`) with a `다시 시도` action.
- The native splash screen (`expo-splash-screen`) stays up while a saved session is restoring, so the
  login screen never flashes before an authenticated redirect. Once restore settles — signed in,
  signed out, or errored — the app hides the splash and shows the group list, a pending-invite join
  screen, or the login screen; fixture mode hides it immediately.

### Account Screen

- The screen opens on a centered profile header: a 72pt avatar (the existing `Avatar` component —
  the Kakao/Google photo, or a first-letter monogram), the nickname, and `카카오 계정으로 로그인됨`
  or `Google 계정으로 로그인됨` (the provider ID rendered as its Korean display name). Avatar upload
  stays out of scope (ADR 0008 §5).
- Below the header, a settings list follows this order: a `프로필` section with a `닉네임` row
  (current nickname as the trailing value; tapping it opens the C3 nickname editor,
  `닉네임 변경`, helper text `그룹에서 보이는 이름입니다.`); an `알림` section with `푸시 알림` and
  `메시지 미리보기` toggles (the latter captioned `알림에 메시지 내용을 보여 줍니다.`); then
  destructive `로그아웃` and `계정 삭제` rows. iOS renders the list as an inset-grouped SwiftUI
  `Form` with `Toggle`s; Android renders M3 `ListItem`s with section subheaders and `Switch`es.
- A `__DEV__`-only `개발자` section at the bottom (account storage readiness, server-connection
  diagnostics, the push token, and raw push diagnostics) is hidden from release builds. The
  user-facing push permission copy stays simple: a denial shows `설정에서 알림을 허용해 주세요.`
  with a `설정 열기` button that opens system settings. An account-storage error row (with
  `계정 저장소 다시 시도`) shows to every build, but only when storage actually fails to open.
- Logout and account deletion both confirm through the shared centered `ConfirmAlert` (iOS SwiftUI
  `Alert`, Android `AlertDialog`) — logout asks `로그아웃할까요?` with `취소`/`로그아웃`; deletion
  (M15) titles the alert `계정 삭제` and asks `계정을 삭제할까요? 30일 안에 같은 계정으로 다시
로그인하면 복구할 수 있고, 30일이 지나면 되돌릴 수 없습니다.` with `취소`/destructive `삭제`.
  Neither uses React Native's `Alert.alert`. Both rows' `ListItem`s keep `onPress` defined at all
  times, even mid-request: the Android universal `ListItem` flips its Compose `modifiers` prop
  between an array and `undefined` based on `onPress`'s presence, and `undefined` fails the native
  prop cast instead of degrading (LogBox `PropSetException`, M15 device defect 9) — the handler
  itself guards the in-flight state and ignores repeat presses instead.
- Account recovery (M15, G2): if a 30-day-grace login restores the account, the first screen after
  restore (group list or the pending-invite join screen) shows a one-shot `계정이 복구되었습니다.`
  notice through the shared system-feedback API (iOS centered alert / Android `Snackbar`), handed
  off through a memory-only pending store the same way as `pending-invite-store`.

### Notifications Inbox

- iOS renders a screen-width plain `List` (Mail-style, hairline dividers, not inset-grouped — N1
  overrides the shared C4 list style for this screen); Android renders flat M3 `ListItem`s. Each row
  shows a kind icon (new topic / new message / other), title, body, and a trailing relative time
  (`formatJamyeTimeLabel`: today `오후 3:12`, yesterday `어제`, otherwise `9월 8일`). An unread row
  adds a Berry dot (leading on iOS) and a bold title. The large title `알림함` is the one inbox that
  keeps a large title.
- When the server supplies a group name, and for topic-related notifications a topic title, the row
  shows one extra line, `그룹 이름 · 주제 제목` (or just the group name without a topic); older rows
  without that data show no extra line.
- Tapping a row marks it read and navigates to its destination. An unread row also exposes a
  mark-read-only action without navigating: iOS adds a leading swipe action and a long-press menu
  item, both labeled `읽음으로 표시`; Android exposes the same action through long-press or the
  trailing overflow menu.
- A destination that can no longer be opened shows through the shared system-feedback API:
  `더 이상 접근할 수 없는 알림입니다.` for an authorization loss, or `알림을 열 수 없습니다.` with a
  `다시 시도` action for a network or other failure. The same copy covers a push tap that cannot
  open. An `other`-kind notification only marks itself read; it never navigates.

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

### Message Grouping, Dates, and Actions

- A run of consecutive messages groups by same sender, same calendar day, and within 5 minutes of
  the previous message. For another person's run, their name sits above the run's first bubble and a
  small avatar sits beside the run's last bubble; my own runs show neither name nor avatar.
- A centered date separator (`9월 27일 토요일`, with the year prefixed outside the current year)
  marks the first message after the calendar day changes.
- A system message renders with no bubble at all: small centered gray text.
- A long press on a bubble opens the platform message menu: iOS lifts the bubble into a system
  `ContextMenu` (an `@expo/ui` `Host` + swift-ui `ContextMenu` whose trigger wraps the bubble in
  `RNHostView matchContents`); Android anchors a Compose M3 `DropdownMenu` to the bubble, opened by a
  plain React Native long press on the bubble itself (a bubble hosted inside the Compose trigger
  received no touches on device). Items are conditional on the message: `복사` for text,
  `저장·공유` for a photo/video/voice attachment (the system share sheet), `다시 보내기` for a
  failed message, and (M15) a destructive `삭제` as the last item for a message I sent that is
  still live, or a failed message of mine I want to discard from this device only — never shown for
  another person's message or a still-pending send. The per-attachment share icon this replaced no
  longer renders next to attachments; the failed-message `메시지 다시 보내기` control below the
  bubble (Send State and Retry, below) stays in addition to the menu item.
- Deleting a live message (M15) confirms through `ConfirmAlert` (`메시지를 삭제할까요?` /
  `모든 사람의 대화방에서 삭제됩니다.`, destructive `삭제`); discarding a failed message confirms
  with `메시지를 버릴까요?` / `전송하지 못한 메시지를 이 기기에서 지웁니다.`, confirm `버리기`. Once
  deleted, the row keeps its sender-side alignment and grouping but renders only muted
  `삭제된 메시지입니다.` text — no bubble color, no attachment, no menu, and the message content
  itself never returns from a later `message.created` redelivery or C2 response. The row's sender
  name and avatar do keep following that person's latest identity, though: a C2 page with a live
  message from the same sender, or a fetched topic's author data (list/detail), refreshes it across
  every local row from that sender — including deleted ones — so a deleted account shows
  `탈퇴한 사용자` (no photo) and a restored one shows the original name and photo again.

### Send State and Retry

- Pending is `전송 중`.
- Failed is `전송 실패` and exposes a separate retry control named `메시지 다시 보내기`.
- Sent is `전송됨`.
- The retry control uses the existing message identity. It must not look like a new send action.
- A repository notification that leaves state unchanged does not repeat a live announcement.
- The send-state text for my last bubble in a run renders directly under that bubble, paired with
  the run's trailing time, for example `오후 12:03 · 전송됨`.

### Media Attachments

- A photo or video attachment renders without a colored bubble, at its original aspect ratio (about
  240pt max width) with rounded corners. More than one attachment in a message lays out as a
  2-column grid, up to 4 total. A video shows its thumbnail with a play-icon overlay. Caption text,
  if present, renders as a bubble below the attachment(s), never beside them.
- The server stores no width or height for chat media, so a single attachment learns its displayed
  ratio from the decoded pixel size once it loads; a multi-attachment grid always stays square per
  cell, since a mixed-ratio grid has no single ratio to prefer.
- Tapping an attachment opens a full-screen viewer on the root Stack (`fullScreenModal`
  presentation): swiping left or right pages through that message's attachments, swiping down
  dismisses, and share/save buttons reuse the existing MD5-download-then-system-share-sheet path.

### Voice Messages

- Tapping the composer's microphone starts recording; the OS microphone permission prompt appears on
  this first tap, not at app launch (ADR 0014). Recording replaces the composer with a recording
  bar: a red dot, an elapsed clock, a live metering level bar, `삭제`, and `정지`. Recording
  auto-stops at 3:00, an app-side cap distinct from the server's 330-second limit.
- Stopping shows a preview bar (play/pause, progress, elapsed/duration, `삭제`, and a send control)
  and starts the upload immediately; send enables once the upload completes. A take under 1 second
  is discarded rather than sent.
- If the app backgrounds or a call interrupts while recording, recording stops and the take is kept
  as a preview instead of being discarded; leaving the chat room (back navigation) deletes an
  in-progress recording or an unsent preview.
- A voice message renders as its own bubble: play/pause, a draggable seek bar, and a duration label
  (the server-reported duration, or elapsed time while playing). Only one voice message or video
  plays at a time app-wide, and playback continues in iOS silent mode.
- `expo-audio` provides recording and playback; `expo-haptics` adds iOS-only haptics on record
  start/stop/send (Android does not use haptics here).

### Composer

- The composer is a `+` circular attachment button, a capsule text field (accessibility name
  `메시지 입력`), and a trailing microphone-or-send control. The field empty and no attachment
  queued shows the microphone; text present, or an attachment queued to send, swaps it to the Berry
  send arrow.
- iOS renders the three controls in Liquid Glass chrome (`GlassContainer`/`GlassView`, grouped so
  nearby glass shapes blend), floating over the message list with the list showing through, and
  falls back to a flat surface with a hairline border on iOS < 26 or when Liquid Glass is
  unavailable. Android renders a Material 3 rounded `TextField` with a plain `IconButton` `+` and a
  mic `IconButton` that swaps for a Berry `FilledIconButton` send, sitting in normal flow below the
  list (no floating/overlay treatment on Android).
- The text field defaults to the platform-native control — SwiftUI `TextField(axis: "vertical")` on
  iOS, Jetpack Compose `TextField` on Android — verified on device for Korean IME composition,
  keyboard tracking, multi-line growth, and clearing after send while keeping the keyboard open. A
  single switchable constant (`COMPOSER_TEXT_FIELD_IMPL`) can fall back to the React Native
  `TextInput` shell used before M14 round 2 if on-device verification ever finds a native-field
  regression a mocked test cannot catch.
- Minimum height is 48px. Growth cap is roughly 5 lines (about 120px equivalent), adjusted safely
  for font scaling.
- Enter or Return inserts a newline. `onSubmitEditing`, key press, and composition events never
  send; only the trailing send control does.
- Draft text remains intact during Korean IME composition and after a failed database write. A
  successful explicit send clears the committed draft but preserves input focus and keeps the
  keyboard open.
- The platform keyboard frame and the message list's bottom inset are owned together
  (drag-to-dismiss included); the composer only reports its own measured height and never computes
  keyboard overlap or the list inset directly.
- Tapping `+` opens the system photo/video picker directly (iOS `PHPicker`, Android Photo Picker) —
  there is no intermediate attachment-type sheet. Up to 4 items total (server limit, minus any
  already attached) can be selected at once; each starts uploading immediately and shows as a
  removable (`✕`) thumbnail in a draft tray above the field, alongside optional caption text.

### Send Control

- The trailing composer control is a circular icon button with a minimum target of 44x44 points and
  full radius, in Berry when it can send.
- Whenever the field is empty and no attachment is queued, it shows the microphone glyph
  (accessibility name `음성 메시지 녹음`) and starts a voice recording instead of sending; as soon
  as there is text or a queued attachment, it swaps to the send glyph (accessibility name
  `메시지 보내기`) and only that explicit control sends.
- The send state disables for empty, whitespace-only, or in-flight input; the microphone state
  requests the OS microphone permission on its first tap rather than at app launch.
- Press feedback completes within 150ms using opacity or transform without changing layout.
  Reduced-motion mode keeps immediate non-spatial feedback.

## 5. Layout Principles

### Spacing System

Use the existing 4px and 8px-derived scale: 4, 8, 12, 16, 20, 24, 32, 40, and 48. The 4px and 12px chat-group gaps are intentional semantic values.

### Container and Flow

- Conversation maximum width: 720px equivalent
- Compact gutter: 16px
- Wide gutter: 24px
- Order: native header (title, sync subtitle, and header actions), local-fixture notice, older-page state, message region, composer (`+` attachment button, input, send control)
- The list fills remaining height while the composer remains reachable above the keyboard. Its lower visible boundary follows the same native keyboard progress and lands at the same resting offset when the keyboard closes.
- Do not use an inverted list, fixed desktop width, nested cards, or a separate context rail in M5.

### Radius Scale

- 8px: message directional corner and compact inner geometry
- 12px: compact secondary controls
- 16px: buttons
- 20px: message bubbles
- 24px: large notices or future sheets only
- Full radius: circular controls and the composer capsule

## 6. Depth & Elevation

- Elevation 0: page, message bubbles, list content
- Elevation 1: local-fixture notice when separation is needed
- Elevation 2: composer boundary only when a platform needs separation from scrolling content
- Shadows are subtle, single-source, and top-down. Prefer a divider or surface change over a shadow.
- Do not use glassmorphism, blur, inner clay shadows, or floating decorative layers.
- Base content uses the normal stacking context. The keyboard and platform system UI remain outside application z-index ownership.

## 7. Do's and Don'ts

- DO: Keep Conversation Berry or Petal Berry as the one accent, used only for highlights (active, selected, focused, primary action, own bubble).
- DON'T: Add blue, teal, or gradient accents for loading or success, or tint icons, chevrons, headers, or spinners with Berry.
- DO: Take neutrals from the platform: UIKit semantic colors on iOS, the fixed Berry-seed Material 3 palette on Android.
- DON'T: Rely on Android wallpaper dynamic color or hand-pick hex neutrals per screen.
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
- DO: Keep the message screen focused on chat, its attachments, and voice messages — the features it now ships (M14 round 2).
- DON'T: reserve empty space for connection, auth, or server-diagnostic features; those belong on other screens.
- DO: Let the platform draw the tab bar, header, and bar buttons: Liquid Glass on iOS 26, Material 3 on Android.
- DON'T: rebuild navigation chrome in JavaScript, force a header background or blur on iOS, or put glass on the content layer.

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
- The M5 Simulator/Emulator acceptance recorded so far covers keyboard, IME, anchor, and light/dark behavior. VoiceOver/TalkBack, 200% text, reduced motion, and physical-device checks remain `NOT RUN` for M8 or a separately approved device-acceptance gate.

## 9. Agent Prompt Guide

### Quick Color Reference

- Neutrals are platform-owned (see Section 2): iOS UIKit semantic colors, Android Berry-seed Material 3 hex. The named values below are the authored fallbacks.
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

1. Preserve one accent, the berry primary role, and use it only for highlights: active, selected, focused, primary action, and the outgoing bubble. Everything else takes platform neutral colors.
2. Use the existing independently authored light and dark semantic tokens. Never invert colors mechanically, and match system-bar content to the active canvas contrast.
3. Keep the radius ladder at 8, 12, 16, 20, and 24 points with full radius only for true circles.
4. Keep Korean message and input text at 16 points equivalent or larger and preserve system scaling.
5. Treat newline behavior, IME composition, draft persistence, and scroll anchoring as correctness, not visual polish.
6. Use exact state and retry copy. Do not merge message, pagination, and connection recovery intents.
7. Do not approximate keyboard correction with JavaScript layout steps, delays, or guessed durations. Keep the latest-message anchor synchronized to native keyboard progress and reserve post-layout animated reveal for a locally committed row.
8. Keep the message screen limited to chat, its media and voice attachments — the features it now ships — and free of connection, auth, server-diagnostic, and decorative asset placeholders that belong on other screens.
