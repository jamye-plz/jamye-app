# ADR 0011: 색 체계 — 플랫폼 중립색 위에 Berry는 highlight로만, Android는 Berry 시드 Material 팔레트

- 상태: Accepted (2026-09-22 사용자 결정; M14 라운드 1 사용자 리뷰 3에서 반영)
- 결정일: 2026-09-22
- 적용 마일스톤: M14 라운드 1부터 상시
- 대체하는 결정: [ADR 0005](0005-native-ui-toolkit-adoption.md) D2의 Android 부분(`@android:color/system_*`
  dynamic color)과 "accent는 single primary action role"이라는 [DESIGN.md](../../DESIGN.md) 2절의 범위 정의

## 맥락

M14 라운드 1의 tab bar·헤더 리뷰에서 사용자는 화면 색이 어색하다고 했다. 원인은 세 출처가 섞인 것이다.

- iOS의 배경·글자·헤더·메뉴는 UIKit 시스템 색(ADR 0005 D2)이었다.
- Android의 배경·탭 pill은 API 34 이상에서 `@android:color/system_*` Material You dynamic color라 기기
  배경화면에 따라 연보라·회보라로 바뀌었고, 토큰과 무관했다.
- 토큰 accent(Conversation Berry #9B3F68 / Petal Berry #E39BB8)가 활성 탭뿐 아니라 헤더 아이콘, 리스트
  chevron·leading 아이콘, 첨부·공유 아이콘, RefreshControl, ActivityIndicator, 섹션 제목(Android)까지
  18개 파일에 퍼져 있었다.
- Android 헤더 메뉴(ADR 0010)는 Compose modifier가 PlatformColor를 거부해 토큰 hex를 따로 넘겨야 했다.

사용자 결정(2026-09-22): "플랫폼이 제공하는 native 색을 우선 쓰고, 토큰의 accent는 highlight로만. iOS와
Android 공통." Android 팔레트는 dynamic color 대신 Berry 시드로 고정한다.

## 결정

### D1. accent는 선택·활성 상태와 주요 액션에만 쓴다

Berry(라이트 #9B3F68, 다크 #E39BB8)는 다음에만 쓴다: 활성 탭 아이콘·라벨, 채워진 주요 버튼(`NativeButton`
filled, 전송 버튼), 텍스트 액션 버튼, 포커스된 입력 테두리, 읽지 않음 점, 선택된 chip·행 제목, 내
말풍선(`onPrimary` 글자 포함). 그 밖의 아이콘·glyph·chevron·헤더 tint·RefreshControl·ActivityIndicator·섹션
제목은 플랫폼 label 색(`text`, `textMuted`)이나 플랫폼 기본값을 쓴다. 두 번째 accent는 두지 않는다.

### D2. 중립색은 플랫폼이 제공하는 값을 쓴다

iOS는 그대로 UIKit semantic color(`PlatformColor`)다. Android는 wallpaper dynamic color를 쓰지 않고 Berry
시드(#9B3F68)에서 `@material/material-color-utilities`로 생성한 Material 3 tonal 팔레트를 hex로 고정한다
(`src/core/theme/tokens.ts`의 Android spec: 라이트 surface 98 / container 94 / container-high 92, 다크
canvas는 톤 4(M3 하한, iOS OLED 검정에 가장 가깝다) / container 12 / container-high 17, neutral-variant
30·50·60·80). API 34 게이트와
`@android:color/system_*` 참조는 제거한다. 선택 상태 컨테이너(활성 탭 pill)는 M3 secondaryContainer를
`accentContainer` 역할로 둔다.

### D3. Compose host는 같은 시드를 쓴다

`@expo/ui` `Host`(버튼·시트·스위치·헤더 메뉴)는 `seedColor={colors.primary}`를 받아 Material 3 팔레트를
같은 Berry 시드에서 만든다. Compose primitive에 직접 색을 줄 때는 PlatformColor가 아니라
`androidThemeColors(scheme)`의 hex를 쓴다.

### D4. 헤더와 tab bar chrome은 단색이다

iOS 헤더 tint(뒤로 버튼·bar button)와 Android 헤더 아이콘은 label 색이다. NativeTabs는 iOS에서 플랫폼
기본값(glass, tint만 Berry), Android에서 `surface` 배경·`accentContainer` indicator·`textMuted` 비활성
아이콘/라벨·Berry 활성 아이콘/라벨이다.

## 대안

- **Material You dynamic color 유지**: 플랫폼 기본이지만 브랜드 accent와 배경화면 색이 충돌하고 Compose
  host에 넘길 hex를 얻을 수 없다. 기각.
- **Android도 iOS처럼 무채색 회색 고정**: Material 3 관례에서 멀어지고 Berry tonal 팔레트보다 브랜드
  일관성이 낮다. 기각.
- **Berry를 iOS 앱 tint로 모든 인터랙티브 요소에 적용**: highlight 범위를 넓히는 방향이라 사용자 결정과
  반대. 기각.

## 결과

- 장점: 양 플랫폼에서 같은 규칙(중립 = 플랫폼, 강조 = Berry)이고, Android 색이 기기마다 흔들리지 않으며
  Compose host와 RN 뷰가 같은 팔레트를 공유한다.
- 비용: DESIGN.md 2절 표와 `.design-context.md`, 토큰 테스트, 아이콘 tint를 쓰던 화면 12곳을 갱신한다.
  M5 시절 authored hex(Warm Paper 등)는 web·테스트 fallback으로만 남는다.
- 후속: 라이트/다크 실기기 대비(WCAG AA) 재확인은 M14 다음 라운드 항목이다.

## 참고

- Material 3 — Color system, tonal palettes: https://m3.material.io/styles/color/system/overview
- Apple Human Interface Guidelines — Color: https://developer.apple.com/design/human-interface-guidelines/color
- material-color-utilities: https://github.com/material-foundation/material-color-utilities
