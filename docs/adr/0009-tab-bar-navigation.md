# ADR 0009: 최상위 네비게이션에 tab bar(그룹/알림/계정)를 도입한다

- 상태: Accepted (2026-09-22 사용자 결정; 구현은 M14 라운드 1)
- 결정일: 2026-09-22
- 적용 마일스톤: M14 라운드 1
- 대체하는 결정: [ADR 0005](0005-native-ui-toolkit-adoption.md) D3의 "tab bar는 두지 않는다"

## 맥락

ADR 0005 D3는 native Stack header를 화면 제목 owner로 두고 tab bar 없이 그룹 목록 헤더 아이콘으로
알림함과 계정 화면에 진입하도록 정했다. M12(알림함·푸시)와 M13(프로필·계정 삭제)이 끝나면서 앱의
최상위 목적지는 그룹, 알림, 계정 셋으로 늘었다. 2026-09-22 정적 감사에서 다음이 확인됐다.

- 알림함·계정 진입은 그룹 목록 헤더의 아이콘 3개(+ 시트, 알림+미읽음 배지, 계정)에만 있어 그룹
  안에서는 뒤로 나와야 한다.
- 그룹 목록 → 그룹 상세 → 주제 목록 → 주제 상세 → 대화의 4단계 깊이가 있고, `groups/[groupId]/chatrooms/index`
  경로가 주제 목록을 렌더링해 경로와 화면이 맞지 않는다.
- iOS Human Interface Guidelines의 tab bar와 Material 3의 navigation bar는 3-5개 최상위 목적지를
  분리하는 기본 패턴이다.

사용자는 2026-09-22 M14 라운드 1 범위 결정에서 tab bar 도입을 선택했다.

## 결정

### D1. expo-router `(tabs)` 그룹으로 그룹 / 알림 / 계정 3탭을 둔다

그룹 목록, 알림함, 계정 화면이 각 탭의 루트다. 그룹 목록 헤더의 알림·계정 아이콘과 미읽음 배지는
제거하고 `+` 시트만 남긴다. 각 탭 안의 화면 제목은 ADR 0005 D3의 native Stack header 규칙을 그대로
따른다(large title, minimal back button, header icon button). 구현 수단은 2026-09-22 라운드 1 사용자
리뷰에 따라 expo-router `NativeTabs`다([ADR 0010](0010-platform-native-visual-language.md) D1).

### D2. 대화 화면과 모달은 루트 Stack에 두어 채팅 중 tab bar를 숨긴다

`groups/[groupId]/chatrooms/[chatroomId]`와 그룹 생성·초대 참여·새 주제 모달은 탭 밖 루트 Stack에
둔다. 채팅은 composer가 키보드 위에 붙는 전체 화면 작업이므로 tab bar를 보이지 않는다. 주제 상세는
그룹 탭 내부 Stack에 둔다.

### D3. 미읽음 수는 알림 탭 badge로 표시한다

`notificationsStore`의 `unreadCount`를 알림 탭 badge에 연결한다. 헤더 배지는 없앤다.

### D4. ADR 0005의 D1·D2·D4는 유지한다

`@expo/ui`·`expo-symbols`·`expo-glass-effect` 재도입(D1), platform semantic color(D2), 채팅 sync 상태의
header subtitle 표시(D4)는 바뀌지 않는다. 이 ADR은 D3의 "tab bar 없음"만 대체한다.

## 대안

- **Stack-only 유지 + 진입 동선만 다듬기**: 변경이 작지만 그룹 안에서 알림·계정에 갈 수 없는 구조와
  헤더 아이콘 집중이 그대로 남는다. 기각.
- **Drawer(사이드 메뉴)**: 목적지가 3개뿐이라 과하고, iOS에서는 관례가 아니다. 기각.

## 결과

- 장점: 최상위 목적지 3개가 항상 한 탭 거리이고, 헤더 아이콘이 `+` 하나로 줄어든다. 플랫폼 기본
  패턴이라 접근성(탭 역할, badge 읽기)도 native가 제공한다.
- 비용: route 파일 재배치와 라우트를 참조하는 테스트·checker 경로 목록·product-intent route
  인벤토리·DESIGN.md 4절 갱신이 따른다. native rebuild 여부 판단은 로드맵 M14가 소유한다.
- 후속: M14 라운드 1이 구현하고 양 플랫폼에서 확인한다. 인증 게이트 라우팅 분리, 채팅 제목·계정 화면 정리, 스타일·컴포넌트와 상태 화면은 라운드 2 후보다.

## 참고

- Apple Human Interface Guidelines — Tab bars: https://developer.apple.com/design/human-interface-guidelines/tab-bars
- Material 3 — Navigation bar: https://m3.material.io/components/navigation-bar/overview
- Expo Router — Tabs: https://docs.expo.dev/router/advanced/tabs/
