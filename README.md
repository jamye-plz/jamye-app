# jamye-app

잼얘좀의 iOS·Android 앱이다. React Native와 Expo를 사용하지만 기존 SvelteKit PWA를
기계적으로 옮기지 않는다. 첫 수직 절편은 한 대화방의 메시지를 SQLite에서 읽고,
오프라인 전송 의도를 보존한 뒤 재연결 시 canonical event와 동기화하는 데 집중한다.

현재 저장소에는 Expo SDK 57 기준선과 M3의 Development Build/CNG 앱 기반, strict
environment validation, Error Boundary, system light/dark theme, redacted local logger,
deterministic local fixture가 구현돼 있다. 아래 명령은 실행 절차이며 현재 품질 검사, native
build 또는 runtime 성공을 뜻하지 않는다. 실제로 관찰한 결과만
[`docs/evidence/`](docs/evidence/)에 별도로 기록한다.

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
| Expo                    | `~57.0.16`          |
| React Native            | `0.86.2`            |
| React                   | `19.2.3`            |
| Expo Router             | `~57.0.16`          |
| Expo Development Client | `~57.0.15`          |
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

devShell은 Bun, Node.js, JDK, CocoaPods와 Nix-managed Android build SDK를 고정한다.
Xcode·iOS Simulator와 Android Studio·AVD는 사용자가 호스트에 설치한다. Android build
SDK의 원본은 `ANDROID_HOME`과 `ANDROID_SDK_ROOT`가 가리키는 Nix SDK이며, Android
Studio가 관리하는 SDK는 Emulator/AVD에만 사용한다. 정확한 버전과 검증 명령은
[`docs/research/mobile-baseline.md`](docs/research/mobile-baseline.md)에 있다.

Watchman, Maestro, NDK는 현재 devShell에 포함하지 않았다. 필요성이 생기는 마일스톤에서
근거와 설치 주체를 다시 결정한다.

## 로컬 환경 변수

로컬 기본값은 `.env.example`에 공개돼 있다. 필요하면 `.env.local`로 복사하되 명령 예시에는
두 값을 명시해 어떤 config를 평가하는지 드러낸다.

```sh
cp .env.example .env.local
```

- `APP_VARIANT=development`는 development app config를 선택한다.
- `EXPO_PUBLIC_APP_MODE=local-fixture`는 local fixture 화면만 허용한다.
- 모든 `EXPO_PUBLIC_*` 값은 앱 bundle에 포함될 수 있는 **공개 값**이다.
- Token, credential, private endpoint, 사용자 데이터 같은 비밀은 `.env.example`,
  `.env.local` 또는 `EXPO_PUBLIC_*`에 넣지 않는다.

현재 mode에는 production server, auth 또는 session 연결이 없다.

## Dependency와 재현성

Project dependency owner는 Bun 하나이며 `bun.lock`만 허용한다. `package.json#packageManager`와
devShell의 Bun은 모두 `1.3.13`이어야 한다.

```sh
bun --version
bun install
```

Expo가 호환 version을 선택해야 하는 dependency는 두 environment 값을 붙여 설치하고,
설치 결과를 별도 검토한다.

```sh
APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bunx expo install <package>
CI=1 APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bunx expo install --check
```

Dependency resolution이 끝난 뒤 그 dependency를 사용하는 구현을 시작하기 전에는 사용자가
별도로 승인한 다음 명령으로 lock 재현성을 확인한다.

```sh
CI=1 APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bun install --frozen-lockfile
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

| 단계                  | Expo subcommand            | 의미                                                                     |
| --------------------- | -------------------------- | ------------------------------------------------------------------------ |
| Metro 시작            | `start --dev-client`       | 이미 호환되는 Development Build에 JS bundle 제공                         |
| native 재생성         | `prebuild --clean`         | app config·config plugin·native dependency에서 `ios/`, `android/` 재생성 |
| iOS build/install     | `run:ios --no-bundler`     | 별도 Metro 없이 Simulator용 Development Build compile/install            |
| Android build/install | `run:android --no-bundler` | 별도 Metro 없이 Emulator용 Development Build compile/install             |

Repository root에서 사용하는 실제 명령은 다음과 같다.

```sh
APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bunx expo start --dev-client
APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bunx expo prebuild --clean
APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bunx expo run:ios --no-bundler
APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bunx expo run:android --no-bundler
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
CI=1 APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bunx expo install --check
APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bunx --no-install expo-doctor
APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bunx tsc --noEmit
APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bun run lint
APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bun run format:check
APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bun run check:architecture
APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bun run test
APP_VARIANT=development EXPO_PUBLIC_APP_MODE=local-fixture bun run test:coverage
```

Jest와 `jest-expo`가 유일한 test runner다. Application coverage denominator는 정확히
`app.config.ts`와 `src/**/*.{ts,tsx}`이고, 실행 로직이 없는 내부 declaration
`src/**/*.d.ts`만 negative glob으로 제외한다. `eslint.config.js`, `jest.config.js`,
`tools/quality/check-architecture.cjs`는 runner/checker config라 application denominator 밖에
있으며 checker test가 application coverage를 부풀리지 않는다.

Global coverage threshold는 statements, branches, functions, lines 각각 80% 이상이다.
Coverage output은 local ignored `/coverage/`에 생성하며 commit하지 않는다.

## Native와 배포 경계

Nix는 재현 가능한 CLI 환경과 이후의 debug·unsigned build 산출물 패키징까지 담당할 수
있다. Production signing, App Store·Play Store 제출, credential과 외부 EAS resource 생성은
사용자가 직접 수행하며 현재 범위에서는 실행하지 않는다. 기존 PWA, `jamye-server`,
homelab도 이 저장소 작업에서 변경하지 않는다.
