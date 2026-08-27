# jamye-app

잼얘좀의 iOS·Android 앱이다. React Native와 Expo를 사용하지만 기존 SvelteKit PWA를
기계적으로 옮기지 않는다. 첫 수직 절편은 한 대화방의 메시지를 SQLite에서 읽고,
오프라인 전송 의도를 보존한 뒤 재연결 시 canonical event와 동기화하는 데 집중한다.

현재 저장소에는 Expo SDK 57 기준선과 M3의 Development Build/CNG 앱 기반, strict
environment validation, Error Boundary, system light/dark theme, redacted local logger,
deterministic local fixture가 구현돼 있다. 아래 명령은 실행 절차이며 현재 품질 검사, native
build 또는 runtime 성공을 뜻하지 않는다. 실제로 관찰한 결과만
[`docs/evidence/`](docs/evidence/)에 별도로 기록한다. 현재 M3의 품질·native build·fixture
smoke 결과는 [M3 실행 증거](docs/evidence/M3.md)에 있다.

## 현재 범위

M3는 **로컬 Development Build/CNG/foundation/fixture smoke 기반**만 다룬다. 화면의
`local-fixture` 데이터는 메모리에 고정된 개발용 데이터이며 production server에 연결되지
않는다. M3에는 채팅, SQLite, outbox, realtime, server contract 또는 자동 E2E 계약이 없다.

전체 로드맵의 제품 범위는 한 대화방의 offline-first 텍스트 채팅과 복구다.

- M4: bootstrap contract와 SQLite
- M5: 로컬 채팅 읽기·쓰기
- M6: offline outbox와 realtime/delta 복구
- M7: 완성된 채팅 흐름의 E2E와 양 플랫폼 native acceptance

완성형 카카오·구글·애플 OAuth, 그룹·초대·주제 관리, 미디어·STT, production push,
production identifier·signing·store 제출은 후속 backlog다. 자세한 경계는
[`docs/roadmap.md`](docs/roadmap.md)와
[`docs/product-intent.md`](docs/product-intent.md)를 기준으로 한다.

## 고정 기준선

| 항목                    | 값                  |
| ----------------------- | ------------------- |
| Expo                    | `~57.0.17`          |
| React Native            | `0.86.3`            |
| React                   | `19.2.3`            |
| Expo Router             | `~57.0.17`          |
| Expo Development Client | `~57.0.16`          |
| TypeScript              | `~6.0.3`            |
| package manager         | Bun `1.3.13`        |
| route root              | `src/app/`          |
| entry                   | `expo-router/entry` |

Development variant의 simulator/emulator 식별자는 다음 네 값으로만 구성한다.

| 필드                  | development 값       |
| --------------------- | -------------------- |
| app name              | `Jamye Development`  |
| slug                  | `jamye-development`  |
| iOS bundle identifier | `dev.local.jamyeapp` |
| Android package       | `dev.local.jamyeapp` |

`APP_VARIANT`가 없거나 알 수 없는 값이면 app config 해석이 실패한다. `preview`와
`production`도 아직 구성하지 않았으므로 development 값으로 fallback하지 않고 명시적으로
실패한다. Production identifier는 open decision이다.

`src/core/config/expo-base-config.json`은 SDK 57 template에서 보존한 non-identity Expo
설정의 단일 base fragment다. `app.config.ts`는 이 JSON 전체에서 development identity와
`['expo-dev-client', { addGeneratedScheme: true }]`만 더한다. 이 generated scheme은 개발
launcher 연결용일 뿐 공개 custom scheme, universal link 또는 app link 계약이 아니다.

결정 근거는 다음 ADR에 있다.

- [`ADR 0001 — Expo SDK 57 default template`](docs/adr/0001-expo-sdk-57-default-template.md)
- [`ADR 0002 — Bun-only package management`](docs/adr/0002-bun-only-package-management.md)
- [`ADR 0003 — M2 bootstrap 품질 증거의 M3 이관`](docs/adr/0003-m2-bootstrap-quality-evidence-deferment.md)
- [`ADR 0004 — M3 앱 기반과 preference 보류`](docs/adr/0004-m3-app-foundation-and-preference-deferral.md)

## 개발 환경

CLI 개발 환경의 진입점은 repository root의 Nix flake다.

```sh
nix develop path:.
```

devShell 진입 뒤 사용하는 정식 Bun script, 상태 변경 범위와 표준 검증 순서는
[`docs/development-workflow.md`](docs/development-workflow.md)에 있다.

devShell은 Bun, Node.js, JDK, CocoaPods와 Android CLI·build SDK·Emulator·system image를
고정한다. Android 실행 도구의 원본은 `ANDROID_HOME`과 `ANDROID_SDK_ROOT`가 가리키는
동일한 Nix store SDK다. AVD와 Gradle처럼 쓰기가 필요한 상태만 repository와 Nix store
밖의 프로젝트 전용 XDG 경로에 둔다.

| 책임                                                      | 권위 원본                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| Android CLI, build SDK, Emulator, Google Play ARM64 image | locked Nixpkgs composition                                            |
| Pixel 9 exterior skin                                     | pinned official AOSP Android Studio device-art commit and file hashes |
| AVD identity와 hardware                                   | [`nix/android-avd-spec.json`](nix/android-avd-spec.json)              |
| AVD state                                                 | `${XDG_STATE_HOME:-$HOME/.local/state}/jamye-app/android`             |
| Gradle state                                              | `${XDG_CACHE_HOME:-$HOME/.cache}/jamye-app/gradle`                    |
| Xcode, Apple clang, iOS Simulator runtime/device          | host Xcode selected and checked inside devShell                       |

Xcode와 iOS Simulator는 Apple이 배포하는 호스트 자산이라 Nix store에서 공급하지 않는다.
대신 devShell이 `DEVELOPER_DIR`를 고정하고 `SDKROOT`를 비우며 `/usr/bin/clang`,
`/usr/bin/xcrun`과 XcodeDefault toolchain을 진단한다. 따라서 iOS 명령도 devShell에서
실행하되 Apple SDK를 Nix libc++와 섞지 않는다. 정확한 버전과 근거는
[`docs/research/mobile-baseline.md`](docs/research/mobile-baseline.md)에 있다.

### Nix-owned Android AVD

Project AVD는 `jamye_pixel_9_api_36` 하나다. Pixel 9, Google Play ARM64, API 36.1
extension 20, system-image revision 4, Emulator package 37.1.11과 관찰한 display·memory·camera
hardware를 JSON SSOT에 고정한다. Nix SDK는 app compile용 Platform 36과 이 AVD용 image
Platform 36.1을 함께 제공한다. `composeAndroidPackages`가 배포하지 않는 Pixel 9 외형
스킨은 [공식 AOSP Android Studio device-art의 고정 커밋](https://android.googlesource.com/platform/tools/adt/idea/+/ffa01542c9913977fa2cb8e518b49b8de0c05c9e/artwork/resources/device-art-resources/pixel_9/)에서
세 파일을 각각 가져온다. Nix가 Gitiles 응답 해시와 디코딩된 파일 해시를 모두 검증한 뒤
composed SDK의 `skins/pixel_9`에 합성한다.

AVD `config.ini`에는 composed SDK의 매번 달라지는 absolute store 경로 대신
`skin.path=skins/pixel_9`를 기록한다. Emulator는 이를 현재 `ANDROID_SDK_ROOT` 기준으로
해석하고, project verifier는 실행 전에 active SDK의 symlink 대상과 세 파일의 content hash를
검증한다. 따라서 CMake·NDK·Build Tools처럼 skin과 무관한 SDK component 변경만으로는 AVD
reconcile이 필요하지 않다.

다음 명령은 모두 새 `nix develop path:.` session에서 실행한다. `verify`와 기본 diagnostic은
project/AVD state를 바꾸지 않는다. Strict diagnostic은 연결 target을 열거하면서 Nix ADB
server를 시작할 수 있지만 package를 설치하거나 AVD/project file을 쓰지 않는다. `create`는
project state에 AVD가 완전히 없을 때만 한 번 만들며 partial state를 덮어쓰거나 `--force`로
교체하지 않는다. `reconcile`은 complete project AVD가 정지된 경우에만 active Nix SDK의
선언 소유 config/pointer key를 다시 쓰며 userdata·snapshot과 그 밖의 INI key를 보존한다.
Missing·partial·running AVD는 변경하지 않고 실패한다. `start`는 foreign user-SDK Emulator가
하나라도 실행 중이면 재사용하지 않고 실패한다.

```sh
bun run toolchain:check
# Existing project AVD:
bun run android:avd:verify
# First initialization only; use this instead when verify reports that no AVD exists:
bun run android:avd:create
# Existing stopped AVD only; use this when verify reports declarative config drift:
bun run android:avd:reconcile
bun run android:avd:start
bun run android:gradle:stop
bun run toolchain:check:native
# Stop exactly one matching project AVD without deleting its state:
bun run android:avd:stop
```

AVD 생성·reconcile·실행, strict preflight와 native build는 각각 사용자 승인 명령 게이트다.
위 절차가 문서에 있다는 사실만으로 생성이나 검증 성공을 주장하지 않는다. `start`가 PID와
log 경로를 출력한 뒤 Android가 boot를 마칠 때까지 기다리고 strict preflight를 실행한다.

### Android Studio와 user SDK의 검사 경계

Android Studio는 선택적인 편집·검사 UI이고 CLI build authority가 아니다.

- JS/TS 편집에는 repository root를 연다. Gradle 구조를 볼 때만 clean prebuild 뒤 생성된
  `jamye-app/android`를 Android Studio project로 연다.
- Studio의 user SDK와 Device Manager는 별도 실험용으로 유지할 수 있지만 project AVD
  `jamye_pixel_9_api_36`를 만들거나 수정하지 않는다. Nix store SDK를 Studio SDK Manager의
  쓰기 대상으로 지정하지 않는다.
- Studio에 포함된 Pixel 9 device-art와 user SDK skin은 화면 비교에만 사용할 수 있다. Project
  skin의 원본은 JSON SSOT에 고정한 AOSP commit과 해시이며 Studio 설치 경로나 user SDK
  파일을 Nix SDK에 복사하지 않는다.
- Studio가 만든 `android/local.properties`, Gradle JVM override 또는 IDE Gradle daemon은
  CNG 원본이 아니다. Studio를 완전히 종료한 뒤 clean prebuild로 generated project를 다시
  만들거나, 별도 승인된 정확한 cleanup을 수행해야 strict preflight가 통과한다.
- user-SDK Emulator와 Nix-owned Emulator를 같은 이름으로 동시에 실행하지 않는다. Project
  실행·ADB·build 증거는 devShell의 Nix 도구로만 수집한다. Strict preflight는 이미 실행 중인
  ADB server의 실제 executable도 Nix SDK 소유인지 확인한다.

즉 Android Studio에서는 generated native code와 Gradle model을 읽을 수 있지만, 그 session의
SDK 선택·AVD·Run 결과를 재현 가능한 project build 증거로 사용하지 않는다.

Watchman과 Maestro는 현재 devShell에 포함하지 않았다. Android NDK는 첫 M3 Android native
build가 요구한 exact side-by-side revision `27.1.12297006`을 Nix SDK에 포함한다. Gradle이나
`sdkmanager`가 read-only Nix store에 component를 설치하게 두지 않는다. 같은 이유로
Build Tools는 app/RN 계약의 `36.0.0`과 build-tools override가 없는 Android library에 적용되는
AGP 8.12 기본값 `35.0.0`을 함께 공급한다. Native module configuration이 실제로 요구한
CMake `3.22.1`도 같은 immutable SDK에서 공급한다. `ANDROID_NDK_HOME`/`ANDROID_NDK_ROOT`,
`CMAKE_VERSION`, `cmake.dir`로 host 또는 writable SDK를 우회하지 않는다.

## 로컬 환경 변수

로컬 기본값은 `.env.example`에 공개돼 있다. 최초 한 번 ignored `.env`로 복사한다. Package
script는 app 환경값을 반복해서 붙이지 않는다. Expo CLI는 app/native 명령에서 dotenv를
로드하고, Jest는 `jest.config.js#globalSetup`의 `tools/quality/jest-env.cjs`에서 고정된 Node의
`process.loadEnvFile`로 suite 환경 생성 전에 `.env`를 로드한다. `test`, `test:watch`,
`test:coverage`는 모두 직접 Jest 명령을 사용하면서 같은 환경 계약을 공유한다.

```sh
cp .env.example .env
```

- `APP_VARIANT=development`는 development app config를 선택한다.
- `EXPO_PUBLIC_APP_MODE=local-fixture`는 local fixture 화면만 허용한다.
- 모든 `EXPO_PUBLIC_*` 값은 앱 bundle에 포함될 수 있는 **공개 값**이다.
- Token, credential, private endpoint, 사용자 데이터 같은 비밀은 `.env.example`, `.env`,
  `.env.local` 또는 `EXPO_PUBLIC_*`에 넣지 않는다.

현재 mode에는 production server, auth 또는 session 연결이 없다.

## Dependency와 재현성

Project dependency owner는 Bun 하나이며 `bun.lock`만 허용한다. `package.json#packageManager`와
devShell의 Bun은 모두 `1.3.13`이어야 한다.

```sh
bun --version
bun run deps:install:frozen
```

Expo가 호환 version을 선택해야 하는 dependency는 별도 승인된 package만 설치하고 결과를
검토한다. Application 환경은 `.env`에서 로드한다.

```sh
bunx expo install <approved-package>
bun run expo:install:check
```

Dependency resolution이 끝난 뒤 그 dependency를 사용하는 구현을 시작하기 전에는 사용자가
별도로 승인한 다음 명령으로 lock 재현성을 확인한다.

```sh
bun run deps:install:frozen
```

이 검사는 `package.json`과 `bun.lock`을 실행 전후 byte-for-byte 동일하게 유지해야 한다.
허용되는 reconciliation은 ignored `node_modules/`뿐이며 package나 lock drift는 허용하지
않는다. 명령이 문서에 있다는 사실만으로 검사 통과를 주장하지 않는다.

다음 lockfile은 만들거나 commit하지 않는다.

- `bun.lockb`
- `package-lock.json`
- `npm-shrinkwrap.json`
- `yarn.lock`
- `pnpm-lock.yaml`

Lifecycle script가 필요하다는 실제 실패 근거와 사용자 승인 없이 `trustedDependencies`를
추가하지 않는다.

## Development Build와 CNG

Expo Go가 아니라 `expo-dev-client`가 포함된 Development Build를 기준으로 개발한다. 네
명령의 책임은 서로 다르다.

| 단계                  | 정식 script           | 의미                                                                     |
| --------------------- | --------------------- | ------------------------------------------------------------------------ |
| Metro 시작            | `expo:start`          | 이미 호환되는 Development Build에 JS bundle 제공                         |
| native 재생성         | `expo:prebuild:clean` | app config·config plugin·native dependency에서 `ios/`, `android/` 재생성 |
| iOS build/install     | `expo:run:ios`        | 별도 Metro 없이 Simulator용 Development Build compile/install            |
| Android build/install | `expo:run:android`    | 별도 Metro 없이 Emulator용 Development Build compile/install             |

Repository root에서 사용하는 실제 명령은 다음과 같다.

```sh
bun run expo:start
bun run expo:prebuild:clean
bun run expo:run:ios
bun run expo:run:android
```

JS/TS만 변경했고 native dependency, config plugin, native app-config field가 바뀌지 않았다면
호환되는 기존 Development Build에서 Metro reload로 확인할 수 있다. 반대로 다음 변경 뒤에는
기존 client를 재사용하지 않는다.

- native code를 포함하는 dependency의 추가, update 또는 removal
- config plugin의 추가, update, removal 또는 option 변경
- bundle/package identifier, icon, permission처럼 native project에 반영되는 app config 변경

이 경우 `prebuild --clean`으로 native project를 다시 생성한 뒤 iOS와 Android Development
Build를 모두 다시 build/install해야 한다. 이 절차는 qualifying change가 생길 때마다
반복한다. CNG가 생성한 `/ios`와 `/android`는 ignored local output이며 직접 수정하거나
source-controlled 원본으로 취급하지 않는다.

`run:ios --no-bundler`와 `run:android --no-bundler`가 앱을 자동 install/open하더라도 이는
build/install 결과일 뿐 fixture, startup validation, theme 또는 runtime smoke 증거가 아니다.
Runtime 판정은 별도의 두 Metro session에서 현재 bundle임을 확인하는 세 관찰, 즉 invalid
iOS startup, 같은 iOS client의 valid recovery, valid Android fixture가 모두 있어야 한다.
이 문서는 그 관찰이 수행됐거나 통과했다고 주장하지 않는다.

## M3 구조와 상태 경계

```text
src/app/                          얇은 Expo Router route와 root composition
src/core/config/                  Expo base config와 공개 environment validation
src/core/logging/                 structured redacted local logging
src/core/errors/                  root Error Boundary와 recovery UI
src/core/providers/               실제 root provider composition
src/core/theme/                   semantic light/dark token과 system theme provider
src/features/development-fixture/ deterministic in-memory fixture model과 화면
src/shared/ui/                    native screen/text primitive
```

- Route는 feature UI와 root provider만 조합한다.
- `AppProviders`는 startup environment를 검증하고 하나의 active theme provider를 제공한다.
- Theme는 React Native `useColorScheme()`만 따르며 저장 preference나 state library가 없다.
- Local fixture는 production server, HTTP, WebSocket, storage 또는 auth를 사용하지 않는다.
- ESLint가 `app.config.ts`와 모든 `src` TS/TSX에서 직접 transport를 금지하고, route와 UI
  계층에는 더 좁은 import 경계를 적용한다.

Preference가 실제 제품 기능으로 등장하기 전까지 state owner와 persistence를 선택하지 않는다.
SQLite, 작은 KV, memory state 중 하나를 선택할 때는 사용자 범위, logout 정리, migration과
복구 요구를 별도 ADR에서 결정한다.

## 품질 명령과 coverage 계약

다음은 사용자용 검증 명령이다. 한 줄씩 실행하고 실제 exit와 결과를 기록해야 하며, 이
목록 자체는 PASS 증거가 아니다.

```sh
bun run typecheck
bun run lint
bun run format:check
bun run check:architecture
bun run test
bun run test:coverage
bun run check:expo
bun run check:toolchain
```

일상 code gate는 `bun run check:code`, dependency나 native 상태를 바꾸지 않는 전체 검사는
`bun run check`를 사용한다. Formatting 복구, AVD lifecycle, prebuild와 build의 상세한 승인
경계는 [개발 명령과 검증 절차](docs/development-workflow.md)를 따른다.

Lint는 root JS/TS 파일과 `src`, `tests`, 전체 `tools`를 검사한다. Generated native tree,
cache, coverage와 agent 지원 자산은 application lint 범위에 넣지 않는다.

Prettier는 `prettier --check .`로 project-owned code와 product/development 문서를 함께
검사한다. Generated·embedded agent·exported asset, root agent instruction인 `AGENTS.md`와
`CLAUDE.md`, hash-bound recovery config는 `.prettierignore`가 관리하며, `docs/**`에서는
확정된 `docs/evidence/`만 제외한다. Write는 check에서 확인된 경로만 명시적으로 전달한다.

Jest와 `jest-expo`가 유일한 test runner다. Application coverage denominator는 정확히
`app.config.ts`와 `src/**/*.{ts,tsx}`이고, 실행 로직이 없는 내부 declaration
`src/**/*.d.ts`만 negative glob으로 제외한다. `eslint.config.js`, `jest.config.js`,
`tools/quality/check-architecture.cjs`와 `tools/android/nix-avd.cjs`는 repository/native
workflow tooling이라 application denominator 밖에 있으며 helper test가 application coverage를
부풀리지 않는다.

Global coverage threshold는 statements, branches, functions, lines 각각 80% 이상이다.
Coverage output은 local ignored `/coverage/`에 생성하며 commit하지 않는다.

## Native와 배포 경계

Nix는 재현 가능한 CLI 환경과 이후의 debug·unsigned build 산출물 패키징까지 담당할 수
있다. Production signing, App Store·Play Store 제출, credential과 외부 EAS resource 생성은
사용자가 직접 수행하며 현재 범위에서는 실행하지 않는다. 기존 PWA, `jamye-server`,
homelab도 이 저장소 작업에서 변경하지 않는다.
