# ADR 0005: 제품 UI 도구로 `@expo/ui`, `expo-symbols`, `expo-glass-effect`를 재도입한다

- 상태: Accepted
- 결정일: 2026-09-15
- 적용 마일스톤: M5 이후
- 대체하는 결정: ADR 0001의 demo dependency 금지 조항 중 `@expo/ui`, `expo-symbols`,
  `expo-glass-effect` 세 항목

## 맥락

ADR 0001은 Expo default template의 demo UI가 제품 UI가 아니라고 기록하고, `tools/quality/check-architecture.cjs`가 여섯 개 demo dependency(`@expo/ui`, `expo-symbols`,
`expo-glass-effect`, `expo-image`를 포함)를 architecture 검사에서 금지하도록 했다. 이후 채팅
화면(M5)과 그룹·주제 목록, 계정 화면이 native Stack header, native button, sheet, inset-grouped
row 같은 iOS HIG·Android Material 3 수준의 native UI를 요구하게 되면서, custom build 없이
플랫폼 고유의 외형을 얻을 수 있는 최소한의 Expo 제공 native UI module을 다시 검토해야 했다.

## 결정

### D1. checker 금지 정책을 세 패키지에 한해 해제한다

`check-architecture.cjs`가 금지하던 여섯 개 demo dependency 중 `@expo/ui`, `expo-symbols`,
`expo-glass-effect` 세 개는 더 이상 demo 코드가 아니라 제품 UI 도구로 재분류하고 금지를
해제한다. `expo-image`는 native rebuild가 필요해 처음에는 보류했다가, 사용자의 후속 승인으로
같은 날 추가하고 rebuild를 수행했다.

| 패키지              | 버전    | 상태                                            |
| ------------------- | ------- | ----------------------------------------------- |
| `@expo/ui`          | 57.0.17 | 설치 완료, 실행 중인 development build에 linked |
| `expo-symbols`      | 57.0.2  | 설치 완료, 실행 중인 development build에 linked |
| `expo-glass-effect` | 57.0.2  | 설치 완료, 실행 중인 development build에 linked |
| `expo-image`        | ~57.0.5 | 후속 승인으로 설치, clean prebuild·rebuild 수행 |

### D2. 색상: neutral role은 platform semantic color를 사용한다

모든 neutral role(canvas, surface, quiet surface, primary/secondary text, structural outline,
divider)은 iOS에서 `PlatformColor`로 노출되는 UIKit system color, Android API 34 이상에서
`@android:color/system_*_{light,dark}` Material 3 role을 사용한다. API 34 미만에서는 기존 hex
값을 fallback으로 사용한다. Conversation Berry/Petal Berry accent는 이 결정과 무관하게 계속
고정 hex 값을 유지한다.

### D3. navigation: native Stack header를 사용하고 tab bar를 두지 않는다

`expo-router`의 `Stack.Screen`이 제공하는 native header를 화면 title owner로 사용한다. 그룹,
주제 root 화면은 `headerLargeTitle: true`로 large title을 쓰고, 뒤로 가기 버튼은
`headerBackButtonDisplayMode: "minimal"`을 쓴다. `headerRight`에는 icon button을 배치하고,
생성·수정 form은 `presentation: "modal"`로 연다. Tab bar는 두지 않는다. Profile, logout,
diagnostics는 기존 `home-screen.tsx`에서 분리해 전용 `/account` 화면(`src/app/account.tsx`,
`account-screen.tsx`)으로 옮기고, 옛 `home-screen.tsx`는 삭제한다.

### D4. chat: sync 상태를 header subtitle 텍스트로만 노출한다

채팅 화면의 sync 상태는 header subtitle 텍스트로만 노출하며 색상이나 배지를 쓰지 않는다.
`+` 버튼은 `@expo/ui`의 `BottomSheet`를 열어 첨부 옵션을 보여준다. Send 상태 텍스트는 단일
trailing `전송됨` 상태로 유지하고, header에는 refresh icon을 둔다.

## 결과

세 패키지 모두 이미 실행 중인 iOS Simulator, Android Emulator development build에 linked된
Expo module이므로 이번 세션에서 `expo prebuild`, `run:ios`, `run:android`를 실행하지 않았다.
Native build는 사용자가 명시적으로 요청할 때만 수행한다는 프로젝트 규칙에 따른 것이며, 세
패키지의 native binding은 기존 development build에 이미 포함돼 있음을 iOS Simulator와
Android Emulator에서 실행 중인 dev client로 확인했다. `expo-image`만 처음에 보류한 이유는 그
패키지만 native rebuild를 요구하기 때문이며, 후속 승인 뒤 `media-image.tsx`,
`media-video-card.tsx`, `media-image-viewer.tsx`의 React Native `Image`를 `expo-image`로
교체하고(`contentFit`, `recyclingKey`, private local file이므로 목록은 `cachePolicy="memory"`, 뷰어는 `"none"`) clean
prebuild와 양 플랫폼 rebuild를 수행했다.

구현 중 확인한 runtime 제약은 다음과 같다.

- Android에서 `?attr/*` 형태의 `PlatformColor`는 crash를 일으키므로 `@android:color/system_*`
  literal resource를 사용한다.
- `@expo/ui`의 `Host` 자식을 렌더링하는 `FlatList`는 `removeClippedSubviews={false}`가
  필요하다.
- Native-stack header color 옵션은 `PlatformColor` object를 받지 않으므로 hex 또는 이미
  platform이 resolve한 값만 전달한다.

데모는 iOS Simulator와 Android Emulator에서 캡처했다.

후속 과제:

- (완료) `expo-image` 채택과 native rebuild.
- (완료) 고아 상태였던 `chat-rooms-screen.tsx`와 `chat-controls.tsx`는 삭제했다.
