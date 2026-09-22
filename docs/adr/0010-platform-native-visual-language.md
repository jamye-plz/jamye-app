# ADR 0010: 플랫폼 고유 시각 언어를 그대로 쓴다 — iOS Liquid Glass, Android Material

- 상태: Accepted (2026-09-22 사용자 결정; M14 라운드 1 사용자 리뷰에서 반영)
- 결정일: 2026-09-22
- 적용 마일스톤: M14 라운드 1부터 상시
- 대체하는 결정: [ADR 0009](0009-tab-bar-navigation.md) D1의 구현 수단(expo-router JS `Tabs`)과
  [ADR 0005](0005-native-ui-toolkit-adoption.md) D3의 "`headerRight`에 icon button"(iOS 한정)

## 맥락

사용자는 2026-09-22 M14 라운드 1 결과를 보고 "iOS는 Liquid Glass 디자인을 네이티브로, 앞으로도.
Android는 기본 Material Design으로"라고 지시했다. 라운드 1이 도입한 tab bar는 react-navigation의
JS bottom-tabs가 그려 iOS 26 Liquid Glass가 적용되지 않았고, 헤더 버튼은 React Native `Pressable`을
`UIBarButtonItem`의 customView로 넣어 glass 캡슐이 없었다.

Expo SDK 57에는 필요한 수단이 이미 있다.

- expo-router `NativeTabs`(react-native-screens 4.26 `BottomTabs`): iOS는 `UITabBarController`,
  Android는 Material 3 `BottomNavigationView`. iOS 26 SDK로 빌드하면 Liquid Glass가 자동 적용된다.
- expo-router `Stack.Toolbar`: native header item(iOS `UIBarButtonItem`)을 선언적으로 배치한다.
- `@expo/ui`(SwiftUI / Jetpack Compose)와 `expo-glass-effect`(ADR 0005 D1로 이미 도입).
- development client는 Xcode 27(iOS 26 SDK)로 빌드되어 있고 `UIDesignRequiresCompatibility`를 켜지
  않았으므로 native rebuild 없이 glass가 나온다.

Apple Human Interface Guidelines는 Liquid Glass를 navigation layer(tab bar, toolbar, sheet)에만 쓰고
content layer에는 쓰지 말라고 한다. Material 3는 navigation bar와 top app bar의 기본 모양을 정의한다.

## 결정

### D1. 네비게이션 chrome은 플랫폼이 그린다

- Tab bar는 `NativeTabs`다. 아이콘은 `AppSymbol` 맵의 SF Symbol(`sf`)과 Material Symbol(`md`)을
  함께 준다. 알림 badge는 `NativeTabs.Trigger.Badge`다.
- 헤더는 native Stack header 그대로다(ADR 0005 D3의 large title·minimal back 유지).
- 헤더 버튼과 헤더 메뉴는 공용 `HeaderActions`가 플랫폼 파일로 그린다. iOS(`header-actions.tsx`)는
  `Stack.Toolbar placement="right"`의 native bar button item과 `UIMenu` pull-down(iOS 26에서 glass
  캡슐과 시스템 glyph 색)이다. Android(`header-actions.android.tsx`)는 `@expo/ui` Jetpack Compose의
  `IconButton`과 Material 3 `DropdownMenu`를 `headerRight`에 직접 host한다. expo-router의 Android
  toolbar는 버튼에 배경 상자를 그리고 그 modifier가 이 테마의 dynamic PlatformColor를 거부해 앱이
  종료되므로 쓰지 않는다. Compose `Icon`은 Material Symbols glyph를 받지 못하므로
  `assets/icons/material/` 아래 vector drawable XML을 쓰고, 그 목록이 헤더에 놓을 수 있는
  심볼(`HeaderToolbarSymbol`)을 정한다. 메뉴 surface와 glyph 색은 `androidThemeColors(scheme)`의 hex
  값이다. 화면은 액션·메뉴 항목 목록만 넘기며, 헤더 버튼에서 여는 선택지는 bottom sheet가 아니라 이
  메뉴다.
- 시트·버튼·리스트·피커는 `@expo/ui`(SwiftUI / Compose)를 쓴다(ADR 0005 D1).

### D2. iOS는 Liquid Glass를 네이티브 chrome으로만 받는다

Tab bar·헤더·bar button을 JavaScript로 재구현하지 않고, iOS에서 `headerStyle` 배경이나 blur를 강제하지
않는다. 메시지·목록·폼 같은 content layer에는 glass를 쓰지 않는다. 콘텐츠 위에 떠 있는 자체
컨트롤(예: 미디어 뷰어 오버레이)이 필요하면 `expo-glass-effect`의 `GlassView`를
`isLiquidGlassAvailable()` fallback과 함께 쓰며, 이는 라운드 2 이후 항목이다.

### D3. Android는 Material 3 기본값을 유지한다

`NativeTabs`의 Material navigation bar(active indicator, ripple, label) 기본값을 그대로 두고 Berry
primary는 tint로만 준다. Top app bar는 기존처럼 surface 배경이며 아이콘은 Material Symbols다. iOS
chrome(뒤로 chevron, large title 텍스트, iOS 스위치)을 Android에 흉내 내지 않는다.

### D4. 상시 규칙

이후 M14 라운드와 새 화면은 이 ADR을 따른다. 한 플랫폼의 uniform을 다른 플랫폼에 입히지 않는다(iOS에
FAB·ripple 금지, Android에 iOS chrome 금지). ADR 0005 D1·D2·D4와 ADR 0009 D2·D3·D4는 유지된다.

## 대안

- **JS `Tabs` + `expo-glass-effect`로 tab bar를 흉내**: HIG가 말하는 시스템 tab bar 동작(축소, 접근성,
  scroll edge)을 재현할 수 없고 유지비만 든다. 기각.
- **양 플랫폼 공통 커스텀 chrome**: 사용자 결정과 반대다. 기각.

## 결과

- 장점: 플랫폼이 tab bar·헤더·bar button의 모양, 동작, 접근성을 소유하고 OS 업데이트를 따라간다.
- 비용: `NativeTabs`와 `Stack.Toolbar`는 expo-router의 `unstable`/`experimental` API라 SDK 업그레이드
  때 API 변동을 살펴야 한다. 테스트는 `tests/support/stack-toolbar-mock.tsx`의 toolbar 대체물과
  `NativeTabs` mock으로 role 기반 조회를 유지한다. native rebuild는 필요 없다.
- 후속: 미디어 뷰어 오버레이 컨트롤과 채팅 composer의 glass 적용 여부는 M14 라운드 2 후보다.

## 참고

- Apple — Adopting Liquid Glass: https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass
- Expo Router — Native tabs: https://docs.expo.dev/router/advanced/native-tabs/
- Expo Router — Stack (toolbar): https://docs.expo.dev/router/advanced/stack/
- Material 3 — Navigation bar: https://m3.material.io/components/navigation-bar/overview
