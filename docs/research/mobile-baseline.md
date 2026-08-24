# M1 Mobile Toolchain Baseline

- 조사 확인일: 2026-08-23 (Asia/Seoul)
- 실행 검증일: 2026-08-24 (Asia/Seoul)
- 상태: 조사·사용자 승인·단일 Nix 입력 교정·M1 명령 게이트 검증 완료
- 범위: Expo/React Native/Bun/Node/JDK/CocoaPods/Android SDK의 M1 devShell 기준선
- 원칙: 버전 정보는 Expo, React Native, Node.js, Bun, Android Developers, Nixpkgs의 공식 자료만 사용한다.

이 문서는 버전을 자동으로 확정하지 않는다. 아래 후보 A는 2026-08-23 사용자가 명시적으로
승인했다. 같은 날 Android 공식 문서의 최신 상태를 다시 확인한 뒤 사용자는 이전의 두
snapshot 구성을 단일 `nixpkgs-unstable` 입력으로 단순화하고 Android platform-tools만
37.0.1로 교정하는 후속 결정을 승인했다. 에이전트는 설치, scaffold, dependency install,
Nix 평가·빌드, lockfile 생성, native build를 대신 실행하지 않았다. 사용자는 명령
게이트에서 `nix flake lock path:.`, `nix develop path:.`, host diagnostic,
`nix flake check path:.`을 직접 실행했다. 아래 단일 revision이 생성된 lock에 고정됐고,
최종 진단은 23개 검사를 모두 통과했으며 flake check는 exit 0이었다.

## 1. 결론 요약

[Expo SDK reference](https://docs.expo.dev/versions/latest/) 기준 현재 안정선은 **Expo SDK
57**이다. [공식 default template](https://github.com/expo/expo/blob/main/templates/expo-template-default/package.json)은
`expo`를 `~57.0.9`, React Native를 **0.86.2**, React를 **19.2.3**으로 선언한다. SDK
reference는 Node.js **22.13.x 이상**, Android `compileSdkVersion`/`targetSdkVersion`
**36**, iOS **16.4 이상**, Xcode **26.4 이상**도 함께 명시한다.

M1의 승인 후보는 다음과 같다.

| 구성 요소 | 승인 후보 | 선택 이유 |
|---|---:|---|
| Expo SDK | [57](https://docs.expo.dev/versions/latest/) | 현재 공식 stable SDK |
| `expo` template declaration | [`~57.0.9`](https://github.com/expo/expo/blob/main/templates/expo-template-default/package.json) | SDK 57 default template의 현재 선언 |
| React Native | [0.86.2](https://expo.dev/changelog/sdk-57) | `expo@57.0.9`가 메모리 회귀를 해결하며 올린 patch |
| React | [19.2.3](https://github.com/expo/expo/blob/main/templates/expo-template-default/package.json) | SDK 57 default template의 대응 버전 |
| Bun | [1.3.13](https://github.com/NixOS/nixpkgs/blob/391b592eb44808b3bd0cb80bb71b63a5a118b8bb/pkgs/by-name/bu/bun/package.nix) | locked revision에서 확인했으며 devShell assertion으로 정확성을 강제 |
| Node.js | [22.23.2 LTS](https://nodejs.org/en/blog/release/v22.23.2) | Expo/RN 최소 조건을 만족하며 devShell assertion으로 정확성을 강제 |
| JDK | [Azul Zulu OpenJDK 17.0.19, Zulu 17.66.19](https://github.com/NixOS/nixpkgs/blob/391b592eb44808b3bd0cb80bb71b63a5a118b8bb/pkgs/development/compilers/zulu/17.nix) | RN 0.86이 권고하는 Zulu JDK 17이며 devShell assertion으로 정확성을 강제 |
| CocoaPods | [1.16.2](https://docs.expo.dev/build-reference/infrastructure/) | EAS SDK 57 iOS image와 일치하며 devShell assertion으로 정확성을 강제 |
| Android command-line tools | [21.0](https://github.com/NixOS/nixpkgs/blob/391b592eb44808b3bd0cb80bb71b63a5a118b8bb/pkgs/development/mobile/androidenv/repo.json) | locked revision의 Android metadata에서 확인한 명시 버전 |
| Android platform-tools | [37.0.1](https://developer.android.com/tools/releases/platform-tools) | Android 공식 문서의 현재 stable revision이며 Nixpkgs metadata에도 존재 |
| Android SDK Platform | [36](https://docs.expo.dev/versions/latest/) | Expo SDK 57의 compile/target API와 일치 |
| Android Build Tools | [36.0.0](https://developer.android.com/tools/releases/build-tools) | Expo SDK 57 공식 예시 및 Android 공식 문서와 일치 |
| Android NDK | 포함하지 않음 | M1 확정 제외 범위 |

Nix source는 하나만 사용한다.

- 입력: [`github:NixOS/nixpkgs/nixpkgs-unstable`](https://github.com/NixOS/nixpkgs/tree/nixpkgs-unstable)
- 정확한 revision: [`391b592eb44808b3bd0cb80bb71b63a5a118b8bb`](https://github.com/NixOS/nixpkgs/commit/391b592eb44808b3bd0cb80bb71b63a5a118b8bb)
  (lock의 `lastModified`: 2026-08-20T07:12:19Z)
- NAR hash: `sha256-WvvHR4kSQLAbtouMC/ruZ5UpLwlUcY3K4FAllMN+yGk=`
- 일반 package set은 기본 설정으로 import한다.
- Android package set만 같은 locked input을 다시 import하면서 `allowUnfree = true`와
  `android_sdk.accept_license = true`를 적용한다.

2026-08-23 읽기 전용 확인 시 locked revision은 Bun 1.3.13, Node 22.23.2, Zulu
17.0.19, CocoaPods 1.16.2, command-line tools 21.0, platform-tools 37.0.1, Platform 36,
Build Tools 36.0.0을 모두 제공했다. 또한 이전 조사에는
[`0224a92...`](https://github.com/NixOS/nixpkgs/commit/0224a92dddc2fd720bba210d195565241a716df9)
snapshot도 사용해 같은 핵심 package version과 Android metadata를 확인했다. 이 commit은
현재 flake의 별도 입력이 아니다. lock 구조와 revision source 검증, user-run
`nix develop path:.` package realization, devShell 진입은 모두 통과했다. devShell의
exact-version assertion은 locked revision이 승인 조합에서
벗어나면 조용히 다른 version을 사용하는 대신 평가를 실패시킨다.

초기 조사에서는 37.0.1을 Canary로 해석해 37.0.0이 들어 있는 별도 Android metadata
snapshot을 제안했지만, 후속 확인에서 Android 공식 release note가 37.0.1을 2026년 7월
stable로 게시한 상태임을 확인했다. 사용자가 단일 input과 37.0.1을 승인했으므로 이전
두-snapshot 결정은 이 문서에서 명시적으로 폐기한다.

## 2. Expo SDK와 React Native

### 2.1 현재 stable release

- [Expo SDK reference](https://docs.expo.dev/versions/latest/)는 SDK 57.0.0이 React Native
  0.86, React 19.2.3, 최소 Node.js 22.13.x를 사용한다고 명시한다.
- 같은 표는 SDK 57의 Android 최소 OS를 7 이상, `compileSdkVersion`과
  `targetSdkVersion`을 모두 36, iOS 최소 버전을 16.4, Xcode 최소 버전을 26.4로
  명시한다.
- [Expo SDK 57 release note](https://expo.dev/changelog/sdk-57)는 2026-06-30 release와
  SDK 57/RN 0.86 조합을 확인한다. 2026-08-13 update는 `expo@57.0.9`가 React Native를
  0.86.2로 올려 Hermes V1 memory regression을 해결했으므로 57.0.9 이상 사용이
  중요하다고 명시한다.
- [Expo default template package](https://github.com/expo/expo/blob/main/templates/expo-template-default/package.json)는
  확인 시점에 template 57.0.11, `expo: ~57.0.9`, `react-native: 0.86.2`,
  `react: 19.2.3`을 선언한다. Template package patch는 M2 scaffold 실행 시점에 바뀔 수
  있으므로, M2에서도 `default@sdk-57`의 실제 생성 결과를 다시 기록한다.

따라서 M2에서 암묵적 default를 사용하지 않고, 공식
[create-expo-app 문서](https://docs.expo.dev/more/create-expo/)가 제시하는
`default@sdk-57` template을 명시해야 한다. 실제 scaffold 명령은 M2의 사용자 명령
게이트이며 M1에서 실행하지 않는다.

### 2.2 Development Build와 CNG

[Expo development build 문서](https://docs.expo.dev/develop/development-builds/introduction/)는
스토어에 배포할 앱에는 `expo-dev-client`가 포함된 development build를 권장한다. Native
library, app config, SDK가 바뀌면 `expo prebuild --clean` 뒤 development client를 다시
빌드해야 한다. 이 명령들은 M2 이후 사용자 게이트다.

## 3. Bun, Node.js, EAS

### 3.1 공식 지원과 제약

[Expo의 Bun guide](https://docs.expo.dev/guides/using-bun/)에 따르면:

- Bun은 Expo project의 package install과 Node script 실행에 사용할 수 있다.
- `bun create expo`와 `bun expo prebuild`는 template download에 `npm pack`을 사용하므로
  **Node.js LTS도 계속 필요**하다. Bun만 두고 Node를 제거할 수 없다.
- Bun 1.2 이상은 `bun.lock`을 만들며, EAS는 이 lockfile을 보고 Bun을 package manager로
  선택한다. 다른 package-manager lockfile은 함께 두지 않는다.
- Bun은 dependency lifecycle script를 기본 실행하지 않는다. 실제 dependency가
  postinstall을 요구할 때만 `trustedDependencies`를 검토하며, M1에서 미리 넓게
  허용하지 않는다.
- EAS는 `eas.json`에서 Bun exact version을 지정할 수 있다.

확인한 Expo 공식 문서는 SDK 57/Metro에 대한 별도의 Bun-specific 금지나 workaround를
기재하지 않는다. [Expo monorepo 문서](https://docs.expo.dev/guides/monorepos/)도 Expo Metro
config가 Bun을 지원한다고 명시한다. 이는 “모든 조합을 이미 실기기 검증했다”는 뜻은
아니다. 실제 호환성 증거는 M2의 user-run scaffold/install과 이후 doctor/typecheck에서
얻는다.

### 3.2 왜 Bun 1.3.13인가

- Bun upstream의 최신 stable은 확인 시점에
  [1.3.14](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14)다.
- 그러나 잠금 전 조사에 사용한
  [Nixpkgs Bun package](https://github.com/NixOS/nixpkgs/blob/0224a92dddc2fd720bba210d195565241a716df9/pkgs/by-name/bu/bun/package.nix)는
  1.3.13을 제공하며, [Bun 1.3.13 upstream release](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.13)도
  정식 release다.
- M1의 우선순위는 “최신 patch를 custom packaging”하는 것보다 검토 가능한 Nixpkgs
  derivation을 그대로 고정하는 것이다. 따라서 1.3.13을 후보로 삼는다.
- EAS SDK 57 default image는
  [Bun 1.3.14](https://docs.expo.dev/build-reference/infrastructure/)를 사용하지만, Expo는
  `eas.json` exact override를 지원한다. EAS를 실제 구성하는 단계에서 local과 cloud를
  1.3.13으로 맞출 수 있다. M1은 EAS project나 외부 resource를 만들지 않는다.

### 3.3 Node.js 22.23.2

- Expo SDK 57의 최소 Node는 22.13.x이고, [RN 0.86 environment guide](https://reactnative.dev/docs/0.86/set-up-your-environment)는
  Node 22.11.0 이상을 요구한다. 더 높은 Expo 최소 조건이 이 조합의 실제 하한이다.
- [Node.js 22.23.2 release](https://nodejs.org/en/blog/release/v22.23.2)는 이 버전이 LTS인
  security release임을 명시한다.
- 잠금 전 조사에 사용한
  [Nixpkgs Node 22 package](https://github.com/NixOS/nixpkgs/blob/0224a92dddc2fd720bba210d195565241a716df9/pkgs/development/web/nodejs/v22.nix)는
  정확히 22.23.2를 제공한다.

Node 24.19.0도 확인 시점의 최신 LTS이지만, M1 후보는 Expo SDK 57 EAS image가 Node 22
line을 사용하고 Nixpkgs가 최신 Node 22 security patch를 제공하므로 22.23.2를 선택한다.
[Node release table](https://nodejs.org/en/about/previous-releases)에서 22와 24는 모두 LTS다.

## 4. JDK와 CocoaPods

### 4.1 JDK

[RN 0.86 environment guide](https://reactnative.dev/docs/0.86/set-up-your-environment)는
macOS에서 Azul Zulu JDK 17을 권고하고, 더 높은 JDK version은 문제를 일으킬 수 있다고
경고한다. 현재 host의 global JDK 25.0.3은 이 때문에 devShell 후보가 아니다.

잠금 전 조사에 사용한
[Nixpkgs Zulu 17 package](https://github.com/NixOS/nixpkgs/blob/0224a92dddc2fd720bba210d195565241a716df9/pkgs/development/compilers/zulu/17.nix)는
Apple Silicon에서 Zulu 17.66.19 / OpenJDK 17.0.19를 제공한다. `JAVA_HOME`은 이 package의
home으로 설정한다.

### 4.2 CocoaPods

- EAS SDK 57 iOS image는
  [CocoaPods 1.16.2](https://docs.expo.dev/build-reference/infrastructure/)를 사용한다.
- 잠금 전 조사에 사용한
  [Nixpkgs CocoaPods lock](https://github.com/NixOS/nixpkgs/blob/0224a92dddc2fd720bba210d195565241a716df9/pkgs/by-name/co/cocoapods/Gemfile.lock)도
  1.16.2다.

따라서 devShell CocoaPods 1.16.2는 local/EAS parity를 얻으면서 별도 Ruby gem 설치를
요구하지 않는다.

## 5. Android SDK

### 5.1 Expo/RN이 요구하는 build API

- [Expo SDK reference](https://docs.expo.dev/versions/latest/)는 SDK 57의
  `compileSdkVersion`과 `targetSdkVersion`을 모두 36으로 고정한다.
- [Expo BuildProperties 문서](https://docs.expo.dev/versions/latest/sdk/build-properties/)와
  [Android Build Tools release note](https://developer.android.com/tools/releases/build-tools)는
  Build Tools 36.0.0 예시를 제공한다.
- [Android 16 SDK setup](https://developer.android.com/about/versions/16/setup-sdk)는
  Android 16/API 36과 compile/target 36의 관계를 확인한다.
- RN 0.86의 generic environment guide에는 Platform 35와 Build Tools 36.0.0이 적혀
  있지만, Expo framework project에는 Expo SDK 57의 더 구체적인 compile/target 36
  요구를 따른다.

### 5.2 Nix-managed component set

[Nixpkgs Android manual](https://github.com/NixOS/nixpkgs/blob/0224a92dddc2fd720bba210d195565241a716df9/doc/languages-frameworks/android.section.md)은
`composeAndroidPackages`에서 command-line tools, platform-tools, platform, build-tools를
각각 고정할 수 있고, `ANDROID_HOME`을 composed SDK의
`libexec/android-sdk`로 설정한다고 설명한다.

[Android command-line tools 문서](https://developer.android.com/tools)는 새 command-line
tools package가 여러 version을 나란히 설치하고 특정 version에 의존할 수 있게 한다고
설명한다. 아래의 정확한 `21.0` artifact 존재 여부는 잠금 전 조사 snapshot의
[`repo.json`](https://github.com/NixOS/nixpkgs/blob/391b592eb44808b3bd0cb80bb71b63a5a118b8bb/pkgs/development/mobile/androidenv/repo.json)에서
확인했다. 같은 revision은 user-run `flake.lock`에 고정됐다.

승인된 Nix composition은 다음만 포함한다.

| `composeAndroidPackages` 항목 | 값 |
|---|---:|
| `cmdLineToolsVersion` | `21.0` |
| `platformToolsVersion` | `37.0.1` |
| `platformVersions` | `[ "36" ]` |
| `buildToolsVersions` | `[ "36.0.0" ]` |
| `toolsVersion` | `null` (obsolete package 제외) |
| `includeNDK` | `false` |
| `includeCmake` | `false` |
| system image/emulator | M1 Nix composition에는 포함하지 않음 |

[Android Platform Tools release note](https://developer.android.com/tools/releases/platform-tools)는
37.0.1을 2026-07 stable release로 기록하고 최근 platform-tools가 이전 Android version과
호환된다고 설명한다. Platform-tools revision은 `adb` 같은 host tool의 revision이며 앱의
compile/target API 36을 37로 바꾸지 않는다. 앱의 build API는 별도 component인 Platform
36과 Build Tools 36.0.0으로 계속 고정한다.

Android Studio GUI와 AVD는 사용자가 시스템 installer/device manager로 준비한다. 그러나
devShell 안의 CLI build에서 authoritative `ANDROID_HOME`/`ANDROID_SDK_ROOT`는 위 Nix SDK를
가리키며, Android Studio가 별도로 관리하는 SDK를 build source로 섞지 않는다.
composed SDK는 실행 파일을 derivation 최상위 `bin`에 모두 노출하지 않으므로 devShell은
`$ANDROID_SDK_ROOT/cmdline-tools/21.0/bin`과 `$ANDROID_SDK_ROOT/platform-tools`만
`PATH` 앞쪽에 명시적으로 연결한다. Android Studio 관리 emulator는 이 `PATH`에 넣지 않고,
진단 script가 기본 설치 경로를 절대경로로 읽기만 한다.

### 5.3 라이선스 게이트 교정 — 2026-08-23 승인·반영

처음 잠긴 machine plan의 `gate-android-sdk-license`는 `sdkmanager --licenses`가 Nix SDK
root에 marker를 쓴다고 설명했다. Nix store는 read-only이므로 이 설명과 실행 순서는
Nix-managed SDK에 맞지 않았다.

Nixpkgs 공식 Android manual은 composed SDK를 평가할 때 다음 중 하나로 license acceptance를
명시하도록 요구한다.

1. Nixpkgs import config의 `android_sdk.accept_license = true`
2. 단일 명령 환경에서 `NIXPKGS_ACCEPT_ANDROID_SDK_LICENSE=1`

M1은 첫 번째 방식을 사용한다. 사용자가 2026-08-23 이 결정을 명시적으로 승인했으며,
flake에 `android_sdk.accept_license = true`를 기록하고 composed SDK가 성공적으로
realize되는 것을 acceptance evidence로 삼는다. `sdkmanager --licenses`로 Nix store에
쓰는 gate는 machine plan에서 제거했다.

또한 NDK가 M1에서 제외되므로 `ANDROID_NDK_ROOT`를 설정하지 않는다. 처음 plan의
상충하던 설정 요구는 사용자 승인에 따라 제거했다.

## 6. Host 관찰값과 candidate 적합성

scaffold 전 최초 실측 결과는 [workspace baseline](./workspace-baseline.md)에 기록했다.

- Apple Silicon macOS 26.5.2
- Xcode 26.6과 iOS 26.5 simulator 설치·선택 완료
- 최초 관찰 시 Android Studio/SDK/AVD 미설치
- global Bun 1.3.13, Node 24.19.0, Zulu JDK 25.0.3이 있지만 project devShell pin은 아님

Expo의 SDK 57 EAS iOS image도 공식
[build infrastructure 문서](https://docs.expo.dev/build-reference/infrastructure/)에서 macOS
26.5.2, Xcode 26.6, Bun 1.3.14, Node 22.23.1, CocoaPods 1.16.2를 사용한다. 따라서 현재
Xcode는 Expo 최소 26.4를 만족하고 EAS SDK 57 image와도 일치한다. 이후 사용자가 Android
Studio와 ARM64 API 36 AVD를 설치했다. 2026-08-24 최종 host diagnostic은 Xcode,
Simulator, Android Studio, Emulator/AVD, Nix 도구와 composed SDK를 포함한 23개 검사를
모두 통과했다. 최초 관찰 문서는 당시 상태를 보존하며, 현재 판정은
[M1 실행 증거](../evidence/M1.md)를 따른다.

## 7. 승인 후보와 열린 선택

### 후보 A — Nix-native 단일 source (2026-08-23 최종 승인됨)

§1 표의 조합을 승인한다. 장점은 다음과 같다.

- Expo SDK 57/RN 0.86.2의 공식 stable 조합을 사용한다.
- Bun, Node, JDK, CocoaPods는 custom derivation 없이 하나의 locked Nixpkgs revision에서
  얻고 exact-version assertion으로 승인 조합을 강제한다.
- Android SDK도 같은 locked revision에서 조합하되 license/unfree 설정은 Android 전용
  import에만 격리한다.
- NDK, Watchman, Maestro, Android emulator/system image를 M1 devShell에 넣지 않는다.
- production signing, store 제출, EAS 외부 resource를 만들지 않는다.

### 비교 기준 — EAS default parity (승인 후보 아님)

EAS SDK 57 image는 Bun 1.3.14, Node 22.23.1, Java 17을 사용한다. 이를 local에 완전히
맞추려면 현재 선택한 Nixpkgs의 Bun 1.3.13 대신 custom Bun packaging 또는 다른 package
source가 필요하다. M1 devShell의 단순성과 검토 가능성을 위해 기본 권고로 삼지 않는다.

### 사용자 승인 기록

2026-08-23 사용자가 다음 결정을 순서대로 명시적으로 승인했다.

1. 후보 A의 Expo SDK/RN/React/Bun/Node/JDK/CocoaPods/Android SDK 전체 조합과 두 Nix
   snapshot을 최초 승인했다.
2. Android license acceptance를 flake의 `android_sdk.accept_license = true`로 기록하고,
   `sdkmanager --licenses` gate와 M1의 `ANDROID_NDK_ROOT` 설정 요구를 제거한다.
3. 후속 공식 문서 확인 뒤 최초의 두-snapshot 선택을 폐기하고 단일
   `github:NixOS/nixpkgs/nixpkgs-unstable` input을 사용한다. 같은 input을 일반 package
   set과 Android 전용 package set으로 각각 import한다.
4. Android platform-tools만 37.0.1로 교정하고, Platform/API 36과 Build Tools 36.0.0은
   그대로 유지한다.

마지막 두 항목이 앞선 snapshot 선택을 대체한다. `flake.nix`에는 branch reference를 두고,
사용자가 생성한 `flake.lock`이 exact revision을 고정했다. lock, `nix develop`, host
diagnostic, `nix flake check path:.` 명령 게이트가 모두 통과했다.

### Watchman 결정

[Expo의 Android Studio Emulator 안내](https://docs.expo.dev/workflow/android-studio-emulator/)는
Watchman 설치가 SDK 55 이하 프로젝트에만 필요하다고 명시한다. M1은 SDK 57이고 아직
Metro를 실행하지 않으므로 Watchman을 devShell에 넣지 않는다. M2 scaffold 뒤 파일 변경
누락, `EMFILE`, 비정상적인 initial crawl 같은 실제 증거가 있을 때만 별도 승인으로 다시
검토한다.

## 8. Source audit

모든 version claim은 위 본문 가까이에 공식 source link가 있다. 확인한 source의 성격은
다음과 같다.

- Expo SDK/template/development build/Bun/EAS: Expo 공식 문서·공식 repository
- React Native constraint: React Native 0.86 공식 문서
- Node: Node.js 공식 release 문서
- Bun release: Bun 공식 repository release
- Android API/tools: Android Developers 공식 문서
- Nix package/component 조사: NixOS/nixpkgs 공식 repository의 확인 snapshot
- Nix package/component source resolution: user-owned `flake.lock`의 revision과 NAR hash

이 문서와 [M1 실행 증거](../evidence/M1.md)가 아직 보장하지 않는 것:

- 아직 Expo scaffold나 `bun install`로 Bun/Metro compatibility를 검증하지 않았다.
- Android Studio/AVD 존재는 검증했지만 Android native build는 아직 검증하지 않았다.
- 아직 production signing, credential, EAS project, store resource를 만들지 않았다.
