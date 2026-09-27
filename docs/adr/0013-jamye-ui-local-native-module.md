# ADR 0013: `jamye-ui` 로컬 Expo 모듈은 네이티브 UI 선택의 세 번째 층이다

- 상태: Accepted (2026-09-26 사용자 결정; M14 라운드 1 구현과 기기 검증 반영)
- 결정일: 2026-09-26
- 적용 마일스톤: M14 라운드 1부터
- 관련 결정: [ADR 0005](0005-native-ui-toolkit-adoption.md), [ADR 0010](0010-platform-native-visual-language.md),
  [ADR 0011](0011-color-system-platform-neutral-berry-highlight.md)

## 맥락

M14 라운드 1은 가능한 한 `@expo/ui` native component로 그룹 목록, 그룹 상세, 주제 목록, 주제 상세를
구성한다. 그러나 `@expo/ui` 57.0.17에는 두 기능이 없다.

- iOS: remote avatar를 SwiftUI `AsyncImage`로 비동기 로드하고 URL cache와 monogram fallback을 함께
  제공하는 원형 view.
- Android: 날짜 칩 row를 "지난 날짜 왼쪽, 오늘 오른쪽 끝, 초기 위치 오늘"으로 여는 reverse-layout
  `LazyRow`와 Material 3 `FilterChip`.

이 기능을 React Native로 다시 만들면 iOS/Android 모두 native-first 원칙에서 멀어지고, Android 날짜 row는
Compose `LazyRow`의 reverse layout과 초기 trailing 위치를 잃는다. 그래서 로컬 Expo module `modules/jamye-ui`
를 만들되, 컴포넌트 선택 순서의 마지막 보강층으로 제한한다.

## 결정

### D1. 컴포넌트 선택 순서는 세 층이다

1. `@expo/ui` universal component를 먼저 쓴다.
2. universal component가 플랫폼 고유 동작을 표현하지 못하면 `.ios.tsx` / `.android.tsx` 파일에서
   `@expo/ui/swift-ui` 또는 `@expo/ui/jetpack-compose`를 쓴다.
3. 두 층 모두에 없는 기능만 `jamye-ui` 로컬 Expo module로 제공한다.

`jamye-ui`는 공용 디자인 시스템이 아니라 "expo-ui에 아직 없는 native primitive"를 담는 보강 module이다.
새 native view를 추가하려면 먼저 `@expo/ui` universal과 platform-specific layer에 같은 기능이 없는지
확인하고, 해당 이유를 문서와 테스트에 남긴다.

### D2. iOS는 `JamyeAvatarView`만 등록한다

`modules/jamye-ui/ios/JamyeUiModule.swift`는 expo-ui의 `ExpoUIView(JamyeAvatarView.self)`로
`JamyeAvatarView`를 등록한다. 이 view는 독립 Fabric view가 아니라 `@expo/ui` `Host`의 SwiftUI tree 안에
합성된다.

`JamyeAvatarView`는 SwiftUI `AsyncImage` 기반 원형 avatar다. `uri`가 비어 있거나 로드 실패면 이름 첫 글자
monogram placeholder를 그린다. SwiftUI `Image`에 remote URL을 직접 넘기는 방식은 render마다 동기 decode가
일어날 수 있어 사용하지 않는다.

### D3. Android는 `JamyeDateChipRowView`만 등록한다

`modules/jamye-ui/android/src/main/java/dev/jamye/ui/JamyeUiModule.kt`는 Compose view
`JamyeDateChipRowView`를 등록한다. 내부 구현은 `LazyRow(reverseLayout = true)`와 Material 3 `FilterChip`이다.
입력 배열을 뒤집은 뒤 reverse layout으로 렌더해, 오늘이 오른쪽 끝에 있고 초기 scroll 없이 화면에 보이게
한다.

이 view는 expo-modules-core Compose View DSL을 통해 등록되며 `@expo/ui` `Host`의 Berry-seeded
`MaterialTheme`를 공유한다(ADR 0011 D3). JS bridge는 `src/shared/ui/jamye-ui-native.ts`가
`process.env.EXPO_OS`별로 실제 등록된 view만 `requireNativeView`하도록 제한한다.

### D4. Native rebuild와 toolchain 제약을 명시한다

`modules/jamye-ui`는 native module이므로 추가·삭제·ABI 변경·config 변경 뒤에는 clean prebuild와 iOS/Android
development build가 필요하다. Android build는 jamye-app nix devShell의 JDK 17과 고정 Android SDK/NDK
계약을 따른다. 로컬 user SDK나 generated project 직접 수정으로 해결하지 않는다.

### D5. Native event와 Compose props는 충돌을 피한다

React Native event registry와 Expo module event name이 충돌할 수 있다. Android 날짜 칩의 선택 이벤트를
`onSelect`로 등록하면 RN의 기존 bubbling event `topSelect`와 충돌해 render-time 오류가 난다. 따라서 event
이름은 `onDateSelect`로 고정한다.

Compose props는 `ComposeProps` 계약을 따르고, 향후 props가 많아지거나 recomposition 비용이 커지면
Expo의 `@OptimizedComposeProps` 적용을 우선 검토한다. 현재 D3의 props는 `items`, `selectedKey`,
`accentColorHex`, `surfaceColorHex`, `testID`로 제한한다.

### D6. Host interop 규칙은 DESIGN.md와 공유한다

`jamye-ui` view도 expo-ui interop 규칙을 따른다.

- Android `Host`는 Berry `seedColor`를 받는다.
- 날짜 row처럼 가로 scroll을 포함하는 host는 `matchContents={{ vertical: true }}`를 쓴다.
- RN content를 native row나 carousel item에 넣을 때는 `RNHostView`로 경계를 명시한다.
- SwiftUI/Compose 상태 뷰는 반드시 `Host` 안에서 렌더한다.

## 대안

- **React Native avatar와 Animated/FlatList 날짜 row 유지**: 빠르지만 M14의 native-first 원칙과 맞지 않고,
  Android reverse-layout/initial trailing behavior를 안정적으로 보장하기 어렵다. 기각.
- **`@expo/ui` 업데이트를 기다림**: 구현 범위를 줄일 수 있지만 라운드 1에서 확정한 화면 검증을 완료할 수 없다.
  기각.
- **범용 `jamye-ui` design kit로 확대**: Expo SDK 업그레이드 때 유지할 surface가 커진다. `@expo/ui`에 없는
  기능만 담는 좁은 module로 제한한다.

## 결과

- 장점: iOS avatar와 Android date chip row가 각 플랫폼의 native rendering, cache, accessibility surface,
  Material theme를 사용한다.
- 비용: native rebuild가 필요한 소스가 생겼고, Expo SDK/`@expo/ui` 업그레이드 때 local module API와
  Compose/SwiftUI version을 함께 확인해야 한다.
- 제약: Android `build.gradle`은 `@expo/ui`가 쓰는 Compose/material3 version과 맞춰야 한다. 이벤트 이름은
  RN direct/bubbling event registry와 충돌하지 않아야 한다.

## 검증

- JS stub 테스트: `tests/shared/ui/jamye-ui-native.test.tsx`,
  `tests/features/topics/ui/topic-date-chips.android.test.tsx`,
  `tests/shared/ui/avatar.ios.test.tsx`.
- Native smoke: [M14 evidence](../evidence/M14.md)의 20260926 라운드 1 기기 검증에서 iOS avatar,
  Android 날짜 칩 row, `Host matchContents={{ vertical: true }}` 결함 수정과 재확인을 기록했다.
