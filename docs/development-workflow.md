# 개발 명령과 검증 절차

이 문서는 `jamye-app` 개발자가 사용하는 명령의 단일 운영 가이드다. 도구와 버전의 선언
원본, 각 `package.json` script의 책임, 상태 변경 여부와 표준 실행 순서를 함께 기록한다.
README는 빠른 시작만 제공하고 세부 절차는 이 문서를 참조한다.

## 1. 명령 권위와 환경 진입

Nix가 Bun을 공급하므로 저장소 바깥의 전역 Bun이 아니라 프로젝트 루트에서 devShell을 한 번
열고 작업이 끝날 때까지 재사용한다.

```sh
 nix develop . --no-write-lock-file --command bash --noprofile --norc
```

`nix develop .`은 Bun script보다 앞선 bootstrap 명령이라 `package.json` alias를 두지
않는다. devShell에 들어온 뒤에는 직접 `bunx`나 도구 binary를 조합하지 않고 이 문서의
`bun run <script>` 진입점을 사용한다.

### 에이전트의 devShell 세션 재사용

- 에이전트는 `jamye-app`과 `jamye-server`의 터미널 세션을 각각 유지하고 후속 명령을 같은
  세션에 보낸다. 명령마다 `nix develop`을 호출하거나 서로 다른 프로젝트 환경을 중첩하지 않는다.
- 사용자가 별도로 연 터미널을 상속한다고 가정하지 않는다. 실행 에이전트가 세션 ID와 작업
  디렉터리를 관리하고 첫 진입 때 `IN_NIX_SHELL`과 도구 버전을 확인한다. 전체 환경 변수는
  비밀 노출 위험이 있으므로 출력하지 않는다.
- 하위 에이전트는 새 devShell을 개별 생성하지 않고 필요한 검사를 coordinator에 요청한다.
  한 세션에는 한 실행 주체만 입력하며 검사 명령을 순서대로 실행한다.
- 세션 종료 또는 `flake.lock`, devShell·toolchain 설정 변경 때만 해당 세션을 다시 연다.
  일반 소스 수정, 검사 재시도, Gradle daemon 종료만으로 새 환경을 열지 않는다.

Git 저장소에서는 `path:.` 대신 `.`을 사용한다. flake 입력은 Git 추적 파일의 working tree이므로
ignored `node_modules/`, `ios/`, `android/` 같은 산출물을 제외한다. 추적 파일의 미커밋 수정도
사용하지만 새 Nix 입력 파일은 Git 추적 여부를 확인해야 한다. 전체 `path:.` 입력으로 우회하거나
관련 없는 파일을 자동 stage하지 않는다. devShell 안의 로컬 도구는 원래 작업 디렉터리를 읽으므로
새 소스 파일도 검사할 수 있다.

환경 진입은 앱 빌드나 Metro·AVD 시작이 아니다. GC 이후에는 고정 도구를 다시 다운로드하거나
개발 환경을 구성할 수 있다. `nix flake check`는 별도의 검증 명령이며 매번 shell 진입 전에
실행하지 않는다. 테스트·native build·실계정 작업·정리·SCM·배포의 기존 승인 경계는 유지한다.

### dotenv 설정

Application variant와 공개 fixture mode는 package script에 붙이지 않는다. 최초 한 번 안전한
template을 로컬 `.env`로 복사한다.

```sh
cp .env.example .env
```

`.env`와 `.env.local`은 Git에서 제외된다. 이미 `.env.local`을 사용 중이면 `.env`와 충돌하는
값을 동시에 선언하지 않는다. Expo CLI는 app 실행과 native 명령에서 dotenv 파일을 로드한다.
Jest는 `jest.config.js#globalSetup`에 고정된 `tools/quality/jest-env.cjs`가 Node의
`process.loadEnvFile`로 `.env`를 suite 환경 생성보다 먼저 로드한다. 따라서 `test`,
`test:watch`, `test:coverage`는 모두 직접 Jest 명령을 사용하면서 같은 환경 계약을 공유한다.
Test workflow는 개발자마다 달라질 수 있는 `.env.local`을 읽지 않는다. App config가 필요한
명령은 다음 두 키가 없거나 지원하지 않는 값이면 명확하게 실패한다.

로컬 M5 채팅과 OAuth 연결 개발은 mode를 분리해 사용한다.

```dotenv
# Local M5 chat
APP_VARIANT=development
EXPO_PUBLIC_APP_MODE=local-fixture
```

```dotenv
# Connected OAuth development; keep only in ignored local env
APP_VARIANT=development
EXPO_PUBLIC_APP_MODE=connected-auth
EXPO_PUBLIC_API_ORIGIN=https://jamye-api.ridewithmin.com
```

두 mode의 값을 한 환경 파일에 동시에 활성화하지 않는다. `EXPO_PUBLIC_*` 값은 공개 bundle에
포함될 수 있으므로 token과 credential을 넣지 않는다. Environment file precedence는 현재
loader 동작을 확인해 단일 source만 사용하며, 이 문서가 추측한 precedence를 새 계약으로
만들지 않는다.

`EXPO_PUBLIC_*` 값은 bundle에 포함될 수 있다. token, credential, private endpoint, 사용자
데이터는 `.env`, `.env.local`, `.env.example` 어디에도 넣지 않는다.

## 2. 도구와 버전의 선언 원본

버전은 문서나 개발자 전역 설치를 권위 원본으로 사용하지 않는다.

| 영역                    | 현재 승인 버전       | 권위 원본                                                   |
| ----------------------- | -------------------- | ----------------------------------------------------------- |
| Bun                     | 1.3.13               | `nix/toolchain-versions.nix`, `package.json#packageManager` |
| Node.js                 | 22.23.2              | `nix/toolchain-versions.nix`                                |
| JDK                     | 17.0.19              | `nix/toolchain-versions.nix`                                |
| CocoaPods               | 1.16.2               | `nix/toolchain-versions.nix`                                |
| Maestro                 | 2.8.0                | `nix/toolchain-versions.nix`                                |
| Expo                    | 57.0.26              | `package.json`, `bun.lock`                                  |
| Expo Router             | 57.0.24              | `package.json`, `bun.lock`                                  |
| Expo Dev Client         | 57.0.19              | `package.json`, `bun.lock`                                  |
| React Native            | 0.86.3               | `package.json`, `bun.lock`                                  |
| React Native Metro 설정 | 0.86.3               | `package.json`(devDependency), `bun.lock`                   |
| Keyboard Controller     | 1.21.9               | `package.json`, `bun.lock`                                  |
| TypeScript              | 6.0.3                | `package.json`, `bun.lock`                                  |
| ESLint                  | 9.39.5               | `package.json`, `bun.lock`                                  |
| Prettier                | 3.9.6                | `package.json`, `bun.lock`                                  |
| Jest                    | 29.7.0               | `package.json`, `bun.lock`                                  |
| Android Platform        | 36                   | `nix/toolchain-versions.nix`                                |
| Android Build Tools     | 36.0.0, 35.0.0       | `nix/toolchain-versions.nix`                                |
| Android CMake           | 3.22.1               | `nix/toolchain-versions.nix`                                |
| Android NDK             | 27.1.12297006        | `nix/toolchain-versions.nix`                                |
| Android Emulator        | 37.1.11.0            | `nix/android-avd-spec.json`                                 |
| Android system image    | API 36.1, revision 4 | `nix/android-avd-spec.json`                                 |
| Gradle wrapper          | 9.3.1                | React Native/Expo가 생성한 `android/gradle/wrapper`         |
| Android Gradle Plugin   | 8.12.0               | React Native Gradle plugin dependency                       |
| Xcode와 iOS runtime     | host 설치를 사용     | `toolchain:check`가 선택 경로와 실제 상태 검증              |

Nix 또는 package dependency를 바꾸면 이 표를 수동으로 먼저 믿지 않는다. 선언 원본을 변경한
뒤 아래 toolchain, Expo, quality 검사를 통과시키고 문서 표를 함께 갱신한다.

`@expo/ui`(`~57.0.21`), `expo-symbols`(`~57.0.3`), `expo-glass-effect`(`~57.0.4`)는 이번 세션에서
추가된 dependency로 위 표에는 포함하지 않는다. 세 패키지는 처음에 정확한 버전으로 고정했지만
M17 라운드 2 의존성 정렬에서 다른 Expo 패키지와 같은 `~` 범위로 맞췄다(아래 기록). 세 패키지 모두 이미 실행 중인 iOS
Simulator, Android Emulator development build에 linked된 Expo module이라 별도의 native
rebuild 없이 사용할 수 있다. `expo-image`(~57.0.5)는 후속 승인으로 추가한 dependency로 native
rebuild가 필요해 clean prebuild와 iOS·Android rebuild/install을 수행했다. 세부 배경은
[ADR 0005](adr/0005-native-ui-toolkit-adoption.md)를 따른다.

M16(Sign in with Apple)에서 추가한 `expo-apple-authentication`(~57.0.2)도 native 코드가
있는 dependency라 clean prebuild와 iOS dev client rebuild/install이 필요했다(U4 빌드
승인). `expo-module.config.json`의 `platforms`가 `["apple"]`뿐이라 Android native 코드는
없고, Android rebuild는 수행하지 않았다.

## 3. 코드 품질 script

| 명령                                 | 분류        | 결과와 사용 시점                                                |
| ------------------------------------ | ----------- | --------------------------------------------------------------- |
| `bun run typecheck`                  | 읽기 전용   | TypeScript strict 검사                                          |
| `bun run lint`                       | 읽기 전용   | root JS/TS, `src`, `tests`, 전체 `tools` ESLint 검사            |
| `bun run format:check`               | 읽기 전용   | `.prettierignore`를 제외한 project-owned 파일 전체 검사         |
| `bun run format:write -- <files...>` | 상태 변경   | check에서 경고한 파일만 명시적으로 수정                         |
| `bun run test`                       | 읽기 전용   | global setup이 `.env`를 로드한 뒤 Jest 전체 test 실행           |
| `bun run test:watch`                 | 장시간 실행 | 같은 global setup으로 변경 파일을 감시하는 Jest session         |
| `bun run test:coverage`              | 로컬 산출물 | 같은 global setup을 쓰는 전체 test와 80% coverage gate          |
| `bun run check:architecture`         | 읽기 전용   | dependency, source boundary, generated output, script 계약 검사 |
| `bun run check:code`                 | 복합 검사   | typecheck → lint → format → architecture → coverage             |

M6 server contract snapshot은 별도 intake/generation/check 도구로 관리한다. 이 명령은 현재
작업 디렉터리의 `contracts/server/` snapshot과 generated wire type만 대상으로 하며 sibling
server checkout이나 실제 API를 호출하지 않는다.

```sh
# 이미 intake된 sibling contract를 변경하지 않고 snapshot을 갱신해야 할 때만 별도 승인
 bun tools/contracts/intake-server-contract.mjs
 bun tools/contracts/generate-server-contract.mjs

# 현재 checked-in snapshot/generated output의 read-only drift check
 bun tools/contracts/check-server-contract.mjs
```

M6 runtime schema closure는 H1/H2 health, A1-A5 OAuth/session, U1 profile이다. Generated
TypeScript가 runtime validation을 대신하지 않으므로 Ajv validator와 domain mapper test를
함께 확인한다. Contract check가 통과해도 server deployment binding, provider login, native
runtime 또는 production readiness를 의미하지 않는다.

Focused test에는 test script 뒤에 Jest 인자를 전달한다.

```sh
bun run test -- tests/core/logger.test.ts --runInBand
```

Lint의 exact scope는 `eslint "*.{js,cjs,mjs,ts,tsx}" src tests tools`다. Root의 현재·향후
JS/TS config와 declaration, application source, test, repository tool을 자동으로 포함한다.
반면 CNG가 생성한 `android/`·`ios/`, `.expo/`, coverage와 agent 지원 디렉터리는 project
application code가 아니므로 `eslint .`로 끌어들이지 않는다.

`format:check`는 `prettier --check .` 하나만 실행한다. Application source와 config뿐 아니라
README와 `docs/**`의 product/development 문서도 같은 서식 계약에 포함한다. CNG output,
dependency, agent/runtime bundle, root agent instruction인 `AGENTS.md`와 `CLAUDE.md`, exported
asset과 hash-bound recovery config는 `.prettierignore`에서 제외한다. `docs/**`의 문서 예외는
승인 후 확정되는 `docs/evidence/**`뿐이며 M1부터 현재 M5까지의 evidence도 일반 format 검사에서
제외한다. Evidence의 서식 제외는 내용·reference 검증 제외를 뜻하지 않는다.

Formatting은 검사 후 확인된 파일만 고친다. `format:write`는 일부러 target을 내장하지 않은
`prettier --write`이며 반드시 `-- <files...>`를 붙인다. 경로 없이 실행하거나 저장소 전체에
적용하지 않는다.

```sh
bun run format:check
bun run format:write -- tests/core/logger.test.ts README.md
bun run format:check
```

## 변화 위험별 최소 검증과 gate

| 변경 종류                 | 최소 검증                                                    | 별도 gate                                            |
| ------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| 문서만                    | changed-path, diff check, format, architecture, references   | build/native 없음                                    |
| TS/JS behavior            | focused test + type/lint/architecture + aggregate coverage   | runtime relevance에 따라 smoke                       |
| Contract/SQLite migration | generated drift, mapper/validator, migration/integrity tests | data preservation 승인                               |
| Dependency/native config  | frozen install, Expo/toolchain checks                        | clean prebuild + iOS/Android rebuild/install/runtime |
| External account/data     | deterministic tests와 redacted plan                          | 실계정/데이터 mutation 별도 승인                     |
| Production/SCM            | readiness/rollback evidence                                  | commit/push/deploy/store 각각 별도 승인              |

`bun run check:code`의 전체 검사 역할은 유지하되 문서-only 변경에 native build를 요구하지
않는다. 반대로 native-affecting change의 rebuild gate는 완화하지 않는다.

2026-09-09 M6 기능 통합 검사는 41 suites/374 tests를 통과했다. 이후 사용자 승인으로
의존성 보안을 수정한 실행에서는 43 suites/407 tests, server/bootstrap drift 검사가 모두
통과했다. 기존 coverage 기준은 유지했다. 이 실행은 build/native/실계정 검증을 포함하지 않는다.

### 의존성 보안 수정 기록 — 2026-09-09

Expo 57.0.21, Router 57.0.20, React Native 0.86.3과 기존 Router 패치는 유지했다.
`package.json`의 exact overrides와 `patchedDependencies`, `bun.lock`이 재현 가능한 설치를
정의한다. 기존 architecture 검사는 이 변경의 정확한 값과 패치 내용을 확인하며, 임의의
override 추가·버전 범위 확대·패치 제거를 회귀 테스트로 거부한다.

| 의존성               | 적용한 수정                                    | 검증                                                            |
| -------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| js-yaml              | 4.3.2 override                                 | 빈 merge source의 CPU 한도 적용, 실제 YAML 소비자 4곳의 호환성  |
| uuid                 | CommonJS 호환 수정판 11.1.1 override           | v3/v5 buffer 범위 검사, Xcode ID 생성                           |
| decode-uri-component | 0.5.0 override와 query-string 7.1.3 호환 패치  | 잘못된 percent encoding, 한국어·공백·callback query 처리        |
| image-size           | 1.2.1에 ICNS/JXL/HEIF 길이·반복 진행 검사 패치 | 악성 입력의 제한 시간 내 종료, PNG/JPEG/ICNS/JXL/HEIF 정상 치수 |

보안/소비자 회귀 테스트는 `tests/quality/dependency-security.test.ts`와
`tests/quality/image-size-security.test.ts`에 있다. 이미지 테스트는 실제 Metro 의존성을
별도 프로세스에서 실행하고 시간 초과 시 강제 종료한다. 최초 이미지 패치의 적용 위치 오류도
정상 JXL 테스트에서 발견해 수정했다. 설치된 코드로 전체 검사를 다시 통과시켰다.

query-string 패치는 decode-uri-component 0.5.0의 ESM default export를 읽으면서 기존
`+`→공백 동작을 유지한다. 두 의존성의 override/patch는 한 쌍이므로 따로 제거하지 않고
함께 재검증한다. 기존 Router 패치는 CVE 대응이 아니라 NavigationContainer mount 이전
initial-link state 갱신 오류를 막는 패치이며, 기존 회귀 테스트로 유지 여부를 확인한다.

원본 `bun audit --json` 결과는 **High 2건, Moderate 0건**이다. 둘 다 image-size이며,
공식 수정판이 없어 원래 버전 번호에 로컬 패치를 적용했다. 버전 기반 감사는 패치 내용을
판단하지 않으므로 경고가 남는다. 이를 audit 0으로 표시하거나 suppress하지 않는다.
관련 upstream 공지는 [ICNS advisory](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)와
[JXL/HEIF advisory](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)다. 공식 수정판이 나오면
호환성 검증 후 로컬 패치를 제거한다. 패치 검증과 native/user acceptance, 출시 승인은 별개다.

독립 보안 리뷰는 설치 코드와 보안 회귀 테스트 24개를 확인해 수정 범위에서 PASS를 판정했다.
이는 원본 감사가 0건이 됐다는 판정도, 앱 전체의 출시 승인도 아니다.

이 절은 2026-09-09 시점의 기록이다. 2026-10-01 M17 라운드 2 (A)에서 image-size가 의존성 트리에서
빠져 로컬 패치와 `patchedDependencies` 항목을 지웠고, expo-router 패치는 새 버전 key로 옮겼으며,
`bun audit`은 의존성 정리 직후 0건이 됐다. 현재 상태와 근거는 아래 "M17 라운드 2 (A) 의존성·ANR·기기
수용 기록"을 따른다.

설치는 lifecycle script를 실행하지 않는 다음 명령으로 재검증했다. 초기 설치에 남아 있던
구버전 nested YAML은 같은 frozen lock으로 force 재설치한 뒤 실제 소비 경로를 다시 확인했다.

```sh
bun run deps:install:frozen --ignore-scripts
```

Expo install check와 Doctor 21/21, 기본 toolchain 39/39, native preflight 45/45도 통과했다.
Native preflight와 별도로 사용자 승인에 따라 다음 명령을 pinned Nix devShell에서 실행했다.

| 2026-09-09 실행 명령                                                                        | 결과                                                                 |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `CI=1 bun run expo:prebuild:clean --no-install --skip-dependency-update react,react-native` | exit 0; ignored iOS/Android native project 재생성, package 선언 유지 |
| `bun run toolchain:check:native`                                                            | prebuild 전후 각각 45 PASS / 0 FAIL                                  |
| `CI=1 bun run expo:run:ios --device <simulator-udid>`                                       | exit 0; iPhone 17 / iOS 26.5 빌드·설치·실행, 0 errors / 1 warning    |
| `CI=1 bun run expo:run:android --device jamye_pixel_9_api_36`                               | exit 0; Android 빌드·설치·실행, BUILD SUCCESSFUL                     |
| `bun run expo:start --clear --lan --port 8081`                                              | Metro 실행; iOS·Android bundle과 앱 화면 확인                        |

Android의 최초 `--device emulator-5554` 실행은 Expo device name과 ADB serial 차이로
빌드 전에 실패했다. AVD 이름으로 재실행해 통과했다. Metro의 초기 localhost 실행에서는
IPv6 `::1`과 launcher의 `127.0.0.1` 연결이 맞지 않아 LAN listener로 다시 실행했다.
Android에 일시적인 시스템 응답 지연 팝업이 관찰됐지만, 앱 데이터 삭제나 에뮬레이터 재부팅은
수행하지 않았다. 해당 팝업의 원인을 해결했다고 판정하지는 않는다.

이후 사용자가 양 플랫폼에서 Kakao·Google 실계정 로그인 4개 조합을 모두 확인했다.
에이전트의 양 플랫폼 세션 복원·로그아웃 유지, Android 취소·재로그인 관찰과 사용자 로그인 결과, 미확인 lifecycle
항목은 [OAuth 실행 검증](oauth-development.md)에 구분해 기록한다. 이 결과는 앱 전체 출시 승인이 아니다.

### M6 세션 확인 및 정식 종료 — 2026-09-09

로컬 commit `909acd3`의 기존 설치본과 실행 중인 Metro를 사용했다. 명령은 기존
`nix develop path:.` shell에서 실행했으며 source/dependency/native 설정은 바꾸지 않았다.
iOS는 `simctl terminate`/`simctl launch`로 앱 프로세스만 재시작하고 Simulator UI로 확인했다.
Android는 `am force-stop` 후 런처의 Jamye Development 아이콘을 눌러 재실행하고
UI hierarchy로 확인했다. 두 플랫폼에서 저장된 세션 복원과 로그아웃 후 재실행 시 로그인
선택 화면 유지가 관찰됐다. Android Kakao 브라우저 취소와 이후 Google 재로그인도 확인했다.
이후 사용자가 iOS 취소 후 앱 복귀와 Kakao·Google 재로그인이 모두 정상임을 확인하고
M6 종료를 승인했다. 이 결과를 사용자 직접 확인으로 기록하고 M6를 `completed`로 닫았다.
종료 기록 과정에서 native build나 로그인을 다시 실행한 것은 아니다.

중간에 Android `am start -n dev.local.jamyeapp/.MainActivity`로 직접 실행한 두 시도는
17:18과 17:21 KST에 `BIND APPLICATION ANR`로 종료됐다. `dumpsys activity exit-info`와
ActivityManager 로그에서 application startup timeout을 확인했다. 이후 런처 아이콘을 통한
두 실행은 정상 동작했다. 이 차이만으로 intent가 원인이라고 단정하거나 ANR을 수정했다고
기록하지 않는다. 추가 원인 분석은 미완료이며, native 소스 수정이나 재빌드는 하지 않았다.

앱 데이터 삭제, 에뮬레이터 재부팅, bootstrap 정리, server/homelab 변경은 하지 않았다.
개별 세션 결과는 [OAuth 실행 검증](oauth-development.md)의 M6 세션 검증표를 따른다.

## M7 검증과 종료 — 2026-09-10

M7은 `COMPLETED / USER_ACCEPTED`로 종료했다. connected-auth group
list/create/join/detail/roster와 owner/member management는 G1-G8/I1-I2 계약, M6
authorized executor, origin/user/epoch account fence와 in-memory store를 사용한다. SQLite
fixture/bootstrap, SecureStore/MMKV cache, M5 outbox, WebSocket eviction은 이 범위에 포함하지 않는다.

focused 결과는 서로 다른 실행의 결과이며 additive aggregate가 아니다.

| 실행 범위                             | 결과                                                               |
| ------------------------------------- | ------------------------------------------------------------------ |
| task1 contract/auth                   | 6 suites / 92 tests                                                |
| M6 관련 회귀                          | 10 suites / 62 tests                                               |
| architecture fixture                  | 72 tests                                                           |
| auth cancellation follow-up           | 2 suites / 41 tests                                                |
| task2 API/state/error                 | 3 suites / 65 tests                                                |
| groups provider + app provider        | 2 suites / 18 tests                                                |
| management/store/connected-index      | 3 suites / 27 tests                                                |
| groups home/detail/connected-index    | 3 suites / 24 tests                                                |
| TypeScript no-emit typecheck          | exit 0                                                             |
| final aggregate ` bun run check:code` | exit 0; 51 suites / 551 tests                                      |
| final global coverage                 | statements 90.16%, branches 83.40%, functions 92.62%, lines 92.49% |
| contract checker                      | `status:ok`, exit 0                                                |
| transport/architecture regression     | 2 suites / 75 tests passed                                         |

Task2 초안은 테스트 실행 전에 중단된 외부 작업에서 작성됐고 coordinator가 실제 failure regression
cases를 추가·수정했다. 따라서 위 ledger는 clean blank-slate TDD 총계가 아니다. 최종 aggregate는
위 focused snapshot과 별도 실행이며 수치를 합산하지 않는다. 추가 회귀에는 Retry-After
route-reset/explicit-repeat blocking, no-auto-replay, unknown G1/G2 reconciliation, late-list,
late-invite 403/404 eviction fence가 포함됐다. 독립 debug에서 HIGH race가 발견됐고 coordinator가
재현·수정했다. 요구사항·안전성·회귀·구조와 최종 로컬 리뷰가 통과했으며, UX 수정 부분의 독립
재리뷰도 통과했다. 이는 static/fake-transport 판정이며 native/live 검증은 아니다. focused 명령은
`bun run test --runInBand --runTestsByPath <test paths>` 계열이며 전체 aggregate는
`bun run check:code`로 실행해 통과했다.

상세 화면의 같은 그룹 새로고침에서 기존 내용이 사라지는 문제도 model/UI 테스트 두 건으로
재현·수정했다. 일시적 오류에는 기존 내용과 재시도를 제공하고, 다른 그룹 진입이나 403/404 권한
상실에는 내용을 지운다. 관련 store/detail/API/management 4 suites / 63 tests와 위 최종 aggregate가
통과했다. 가짜 bearer·초대 코드·서버 오류 원문을 로그에 남기지 않는 회귀도 포함했다.

route 파일 변경 뒤 ignored Expo route declarations를 갱신하는 확인된 명령은 다음과 같다.

```sh
node -e 'process.env.EXPO_ROUTER_APP_ROOT = process.cwd() + "/src/app"; require("@expo/router-server/build/typed-routes").regenerateDeclarations(".expo/types", {});'
```

이 선언 갱신은 native build나 runtime acceptance가 아니다. 별도로 2026-09-09 기존 M6 Development
Build에서 현재 M7 bundle을 실행하고 양 플랫폼 세션 복원·health·group 화면의 기본 동작을 확인했다.
M7에는 dependency/native configuration 변경이 없어 clean prebuild·재빌드·재설치는 하지 않았다.

2026-09-10 사용자가 양 플랫폼에서 실제 배포 API를 통한 그룹 생성·초대·가입·나가기와 계정 전환을
확인하고 종료 기록·로컬 커밋을 승인했다. 이를 근거로 M7을 종료하며, 자세한 결과 출처는
[M7 evidence](evidence/M7.md)를 따른다. 다른 관리 기능의 개별 실사용 확인과 검증 데이터 정리는
보고받지 않았다. 앱 전체 production readiness, M8 구현과 push/배포는 이번 종료 범위가 아니다.

## M8 검증과 종료 — 2026-09-10

M8은 `COMPLETED / USER_ACCEPTED`로 종료했다. C1-C4 server contract를 사용하는
주제 목록·메시지 조회·전송·수동 재시도·내 읽음 위치 저장을 기존 화면에 연결했다.
화면의 메시지 원본은 account-scoped SQLite이며 bootstrap/fixture와 계정 데이터는 분리한다.

통합 구현의 ` bun run check:code`는 60 suites / 673 tests, architecture 위반 0건과
coverage 기준을 통과했다. 서버 C3 보강·리뷰 수정 배포 이후 기존 Development Build와
Metro를 재사용해 양 플랫폼을 실행했고, 사용자가 송수신·읽음 결과 표시, 한글 입력·줄바꿈,
이전 메시지 로딩·스크롤 유지, 실패 후 재시도를 모두 정상으로 확인하고 종료를 승인했다.
명령별 결과, 배포 revision, 관찰 출처와 종료 커밋 전 재검증은 [M8 evidence](evidence/M8.md)에 기록한다.

종료 기록에서는 기존 app devShell을 재사용한다. 새로운 Nix 환경이나 검증 프레임워크를
만들지 않으며 dependency/native 설정 변경, 재빌드·재설치·실계정 작업·배포도 반복하지 않는다.
기존 architecture 목록에는 새 종료 문서의 정확한 경로만 추가하고 다른 검사 경계는 유지한다.
메시지별 상대방 읽음 표시와 주제별 안읽음 표시는 미구현이며 기존 후속 마일스톤에 추가하지 않는다.
당시 다음 단계였던 M9는 아래의 별도 구현·검증·사용자 승인으로 종료했다.

## M9 검증과 종료 — 2026-09-10

M9는 `COMPLETED / USER_ACCEPTED`다. 기존 app devShell을 재사용한 최종 `bun run check:code`는
70 suites / 814 tests, architecture 위반 0건으로 통과했다. Coverage는 statements 87.52%,
branches 82.58%, functions 91.33%, lines 90.82%이며 기존 80% 기준을 유지했다.
Server/bootstrap 계약 검사, Expo Doctor 21/21, Nix/toolchain 39 diagnostics도 통과했다.
독립 리뷰를 마쳤으며 기존 image-size High 2건은 원본 감사에 남아 있다. 패치 회귀 PASS와
audit-zero를 혼동하지 않는다.

Native 입력 변경 없이 기존 Development Builds와 Metro를 재사용했다. 에이전트의 제한된
양 플랫폼 실행 관찰 이후 사용자는 즉시 송수신, 백그라운드 누락 복구, 오프라인 전송 대기 후
재시작·재연결, 계정 전환 격리의 4개 항목을 모두 정상으로 확인하고 로컬 커밋·종료를 승인했다.
종료 문서와 exact-path 검사 목록만 마무리하며 제품 테스트·빌드·실계정 작업·배포를 반복하지 않는다.
출처별 결과와 검증 한계는 [M9 evidence](evidence/M9.md)를 따른다.
M9 종료 이후 M10 주제·태그 계획을 검토했고, 아래와 같이 문서 확정 승인을 받았다.
앱 전체 출시와 push/배포는 별도다.

## M10 구현과 focused 검증 — 2026-09-10

M10은 `COMPLETED / USER_ACCEPTED`다. 사용자는 계약·데이터 연결 → 주제·태그
화면 → M9 동기화 연결 → 자동 검증·양 플랫폼 수용의 범위·순서를 확정한 뒤 별도로 구현을 승인했다.
기능, API 권한, 재조회·재시도 경계, 제외 범위와 완료 조건은 [로드맵의 M10 계획](roadmap.md#m10-주제태그)을 따른다.

계획 확정 시의 문서 검사와 이후 구현 검사를 구분한다. 구현에서는 app devShell을 재사용해
T1-T7 validator/mapper/API, additive account v4 주제 캐시, 목록·생성·상세·제목/본문·태그 편집과
기존 M9 신호 연결을 추가했다. 세션이 종료된 뒤에만 새 세션을 한 번 열었고 명령마다 Nix를 다시 호출하지 않았다.
기존 source/generated 계약 hash와 native/dependency 입력은 유지했다. Generator로 schema closure에 T1-T7만 추가했다.

### 최초 로컬 구현 검사

에이전트가 fake transport·in-memory SQLite로 실행한 관련 회귀 묶음은 **46 suites / 573 tests PASS**다.
주제 API/입력/권한/페이지/멱등 재시도, 계정·epoch 격리, 화면·route, M7 그룹, M8/M9 채팅·outbox·delta,
session/provider와 계약 회귀를 포함한다. 별도 실행들의 테스트 수를 더한 값이 아니라 아래 한 실행의 결과다.

```sh
 bun run test --runInBand tests/features/topics tests/core/database/account tests/core/contracts tests/features/chat tests/features/sync tests/features/groups tests/quality/topics-boundaries.test.ts tests/core/providers tests/core/app-providers.test.tsx tests/app/thin-routes.test.tsx
```

실제 임시 SQLite에서는 v3 → v4 후 기존 room/message/outbox/checkpoint 보존, 재실행,
다른 계정/그룹 거부, 캐시 재사용, 새 marker 보존, 쓰기 실패·도중 취소의 transaction rollback을 확인했다.
이 focused 검사 단계에서는 실계정 DB 파일을 열거나 migration하지 않았다. 앱 실행 시 v4 migration이 적용되며
이전 앱으로의 DB downgrade는 제공하지 않는다. 아래의 native 실행은 이후 별도로 승인받아 진행한 단계다.

추가 회귀에서 재현하고 수정한 것은 S1 `group_topics` commit 후 UI 알림 누락, M9 구독 함수 변경 시
topic store 조기 dispose, 동일 그룹 복귀 후 생성 상태가 pending에 갇히는 경우, SQLite 작업 도중 취소 시 marker 해제다.
화면의 title/body/tag 입력은 단위 UI 검사이며 실제 한글 IME·키보드·VoiceOver/TalkBack 수용을 대신하지 않는다.

`typecheck`·lint·architecture·format는 모두 PASS, architecture 위반은 0건이다.
Server/bootstrap contract drift 검사는 각각 `status: ok`이며, `oma docs verify --no-urls`는
변경 문서 4개 / 참조 151개 / 기존 skip 2개 / broken 0건이다. 외부 URL은 검사하지 않았다.
이 최초 구현 검사에는 전체 coverage·독립 리뷰·native 실행을 포함하지 않았다. 이후 아래 결과를 별도로 기록하며
M9 PASS를 M10 증거로 재사용하지 않는다.

### 전체 자동 검증과 독립 리뷰

사용자의 “전체 coverage·독립 리뷰 → iOS·Android 실행 검증 진행해” 승인으로 app devShell을 재사용했다.
첫 전체 실행은 실제 architecture 검사를 통과했지만 품질 검사 자체의 synthetic fixture가 새 M10 경로를
반영하지 않아 실패했다. 정책을 완화하지 않고 해당 fixture의 source/test/lint 목록만 맞췄다.
주제·날짜 pagination의 페이지 합치기·중복 제거·중복 요청·이전 날짜 응답 격리·순환 cursor·빈 중간 page
거부와 재시도 회귀도 보강했다.

- 최종 `bun run check:code`: **76 suites / 902 tests PASS**, architecture 위반 0건.
- Coverage: **statements 85.54%, branches 81.46%, functions 87.59%, lines 89.00%**. 기존 전역 80% 기준과
  측정 대상을 유지했다. 실제 SQLite 회귀를 실행하는 Bun subprocess는 Jest instrumentation에 완전히 포함되지
  않으므로 해당 실행 성공을 임의의 SQLite coverage 수치로 바꾸지 않는다.
- Typecheck·lint·Prettier·architecture, server/bootstrap contract drift 검사 모두 PASS.
- Expo package compatibility·Doctor **21/21 PASS**, 설치·빌드 없는 toolchain diagnostics **39/39 PASS**.
- `bun audit`는 기존 **image-size High 2건**으로 exit 1이다. 설치된 mitigation patch 회귀는 전체 검사에 포함돼
  통과했지만 audit-zero나 앱 출시 승인으로 해석하지 않는다. 이번에 의존성·native 입력은 변경하지 않았다.

별도 Claude QA context에서 독립 정적 리뷰와 수정 재리뷰를 마쳤으며 최종 판정은 **PASS**다.
리뷰어는 테스트·빌드·native 앱을 실행하지 않았고 자동 실행 결과는 coordinator의 위 결과와 구분한다.

1. **MEDIUM 수정:** 생성 요청이 403/404/422로 확정 거부된 뒤에도 이전 생성 시도를 유지해 수정한 제목을
   제출하지 못하는 문제를 회귀로 재현했다(RED 3건). 해당 확정 거부에서만 intent를 해제한다.
   HTTP 409와 결과가 불확실한 네트워크 오류는 같은 key/payload를 유지하며 새 키로 자동 우회하지 않는다.
   수정 후 관련 2 suites / 51 tests 및 위 최종 전체 검사가 통과했다.
2. **LOW 제안 기각:** 본문 trim 제안은 읽기 전용 server source와 대조했다. 서버가 title만 정규화하고
   body 공백·줄바꿈을 보존하므로 앱도 이를 유지한다. 원본 body 전송 회귀를 추가했고 재리뷰도 기각에 동의했다.
3. Create 5xx/미상 오류의 개별 테스트 추가는 비차단 권고다. 오프라인 주제 큐 미보유, 그룹 단위 query cache
   무효화와 단일 account sync 신호의 coalescing은 명시된 범위이며 새 기능으로 확대하지 않는다.

### 양 플랫폼 실행 관찰과 사용자 수용

Native/dependency 입력 변경 없이 기존 Development Builds를 재사용하고 Metro 8081에서 최신 번들을 다시 불러왔다.
Clean prebuild·재빌드·재설치·앱 데이터 초기화는 하지 않았다.

| 에이전트 관찰              | iOS                                                     | Android                                         |
| -------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| 기기                       | iPhone 17 / iOS 26.5                                    | jamye_pixel_9_api_36 / emulator-5554            |
| 기존 로그인 세션 복원      | Kakao                                                   | Google                                          |
| 서버 진단                  | live / ready, postgres·redis·minio ready                | live / ready, postgres·redis·minio ready        |
| 기존 같은 그룹의 주제 화면 | 기본 주제 진입 버튼·빈 목록·서울 날짜 필터 정상         | 기본 주제 진입 버튼·빈 목록·서울 날짜 필터 정상 |
| 작성 진입·취소             | 빈 제목 제출 차단, 미전송 제목 입력·비우기 후 목록 복귀 | 빈 제목 제출 차단, 입력·제출 없이 목록 복귀     |
| 홈 화면 → 앱 복귀          | 날짜 선택 유지, 목록 정상                               | 날짜 선택 유지, 재조회 busy 후 정상 목록        |

두 앱을 같은 기존 그룹의 전체 날짜 목록에 두고 Metro와 app devShell을 유지했다. 관찰 중 기능 오류 화면이나
Metro 앱 오류는 발견하지 않았다. Android light theme의 상태표시줄 아이콘은 밝은 배경에서 대비가 낮게 보였다.
이번 실행에서 원인 수정·접근성 수용을 완료한 것은 아니다. 이는 자동 mobile E2E, 한국어 IME 전체 조합, VoiceOver/TalkBack 또는
기존 Android 시작 ANR 이슈의 해소 판정이 아니다. 실서버 주제·태그·메시지 생성/수정/삭제와 새 로그인은 하지 않았다.

이후 사용자가 [로드맵의 네 사용자 수용 항목](roadmap.md#m10-주제태그)을 **양 플랫폼 모두** 확인하고
“양 플랫폼에서 모두 확인했어. 제대로 작동해. M10 종료하고 커밋해”라고 보고·승인했다.
생성·상세·대화 송수신, 제목/본문·태그/권한, 다른 계정의 신규 주제·복귀 복구, 그룹·계정 전환 격리를
사용자 보고 기준 4/4 PASS로 기록하고 M10을 정식 종료한다. 에이전트가 이를 재실행한 결과는 아니다.
구체적 자동 로그·리뷰·제한된 실행 캡처는 현재 run의 `.agents/results/m10-validation-20260910.md`에 연결했다.
출처별 종료 기록과 검증 한계는 [M10 evidence](evidence/M10.md)를 따른다. 종료 작업에서는 문서와
새 evidence 문서의 exact-path 품질 목록만 확인하고 로컬 커밋하며 제품 코드·native·실계정 검사를 반복하지 않는다.
Push·서버 배포·장치 종료는 요청 범위가 아니다. 이 M10 종료 당시에는 M11 구현을 승인하지 않았다.

## M11 검증 이력과 형식 호환성 재빌드 대기 — 2026-09-11

이후 미디어 계획 검토를 거쳐 사용자의 “구현 착수해” 승인을 받았다.
범위와 순서는 [M11 로드맵](roadmap.md#m11-미디어-업로드첨부접근), 실제 실행 결과는
[M11 evidence](evidence/M11.md)를 따른다. 같은 app devShell에서 scoped 의존성 설치,
계약 generation, focused 테스트·type/lint를 실행했다. 최종 focused 55 suites / 616 tests,
typecheck·lint·architecture·server contract 검사가 통과했다. 이후 전체/native 검증 승인으로
PUT-only 수정 후 전체 100 suites / 1,115 tests, coverage 85.77/81.15/87.09/88.94%와 독립 리뷰·보완을 마쳤다.
이후 사용자 수용 중 발견한 picker 버튼 무반응은 화면 생명주기 정리 후 종료된 상태를 재사용한
문제였다. JS 생명주기 보완 후 전체 101 suites / 1,119 tests, coverage 85.88/81.31/87.19/88.98%와
독립 정적 리뷰가 통과했다. iOS 사진·음성 선택창 열기/취소는 관찰했으며 양 플랫폼 실제 첨부는 재검증 대기다.
서버 Rust compile이나 새 Nix 환경은 필요하지 않았다.

Connected mode의 API와 별도로 다음 공개 origin을 설정한다.

```dotenv
EXPO_PUBLIC_MEDIA_ORIGIN=https://jamye-media.ridewithmin.com
```

이 값은 signed URL의 허용 origin이다. URL 경로나 query를 붙이지 않는다. 값이 없으면
로그인·텍스트 대화는 유지하되 미디어 기능을 사용할 수 없다고 표시하며 임의 host를 허용하지 않는다.
로컬 ignored `.env`에는 이 공개 값만 추가했다. secret은 앱 환경에 넣지 않는다.

추가 패키지는 Expo SDK 57의 image-picker, document-picker, file-system, sharing이다.
이미지·동영상 선택과 기존 오디오 파일에 한정하며 카메라·마이크 권한은 비활성화한다.
기존 라우터/보안 패치는 유지한다. 승인 후 양 플랫폼 clean prebuild·재빌드·설치를 통과했고,
새 바이너리에서 기존 세션·로컬 저장소와 서버 연결이 정상임을 확인했다. 통제된 로컬 endpoint로
307/credential isolation·다운로드 취소는 통과했지만 File PUT의 MIME 덮어쓰기와 전체 JS buffering을 발견했다.
후속 승인으로 PUT에만 local Expo module을 연결했다. Swift URLSession 파일 업로드와 Kotlin OkHttp 파일
전송을 사용하며 서버 계약·API·다운로드·기존 outbox 구조는 유지했다. 외부 의존성을 추가하지 않았다.
새 모듈을 포함한 clean prebuild·양 플랫폼 빌드/설치, Android 경로 별칭 보완 후 재빌드까지 통과했다.
실제 native 합성 시험에서 정확한 MIME·50 MiB PUT·인증 분리·redirect 금지·취소를 확인했다.
이는 peak RSS 측정이나 실제 사용자 첨부 수용을 대신하지 않는다. 사용자 수용과 M11 종료는 남아 있다.
임시 probe는 앱에서 분리하고 로컬 probe 서버를 종료했다. 기존 app devShell과 Metro·에뮬레이터는 유지한다.

Native 입력을 변경하면 기존 clean prebuild와 양 플랫폼 재빌드·설치 규칙을 따르며, 변경하지 않은 입력 때문에
재빌드를 자동 요구하지 않는다. 의존성·toolchain이 바뀌면 해당 검사도 수행하되 문서 변경마다 새 manifest/lock
승인 절차를 만들지 않는다.

### iOS HEIC/MOV 형식 호환성 보완

사용자의 후속 native 호환성 수정 승인으로 `expo-image-manipulator ~57.0.16`을 추가했다.
공통 이미지 변환기는 HEIC 등 OS가 해독 가능한 형식을 native JPEG로 준비하고, iOS picker는 영상을
최대 1080p H.264/AAC MP4로 내보낸다. Android 기존 선택 경로와 서버 계약·PUT 전송은 유지한다.
원본을 건드리지 않고 변환 출력의 실제 크기·형식을 검사하며, 화면 이탈 등 늦은 결과의 임시 파일을 정리한다.

재사용 중인 app devShell에서 `bun run check:code` 102 suites / 1,165 tests PASS,
coverage 86.05/81.60/87.25/89.11%, `bun run check:expo` SDK 일치·Doctor 21/21 PASS,
`bun install --frozen-lockfile` 변경 없음까지 확인했다. 실제 native API는 자동 회귀에서 대역을 사용했다.

새 native 의존성 때문에 **별도 승인 후 양 플랫폼 clean prebuild·재빌드·설치가 필요**하다.
이번 수정에서는 빌드·생성·실계정 파일 업로드·commit/push를 실행하지 않았다. Metro 새로고침이나
위의 이전 PUT native PASS만으로 새 HEIC/MOV 변환 검증을 완료했다고 판단하지 않는다.
재빌드 후 사용자가 iOS HEIC/MOV 첨부와 상대 플랫폼 열기, Android 기존 첨부 회귀를 확인한다.
위 내용은 2026-09-11 당시 기록이며 후속 실행과 남은 수용 항목은 [M11 evidence](evidence/M11.md)에 기록한다.

### 영상 표시·native 재생 보완 — 2026-09-14

사용자 승인 후 이미지 변환 모듈을 포함한 양 플랫폼 clean prebuild·재빌드·설치를 마쳤다.
사용자가 송수신 성공과 양 플랫폼 영상 재생 불가를 보고해, 별도 승인된 버튼 대비·영상 카드·기본 native
재생을 추가했다. 기존 화면에는 video player가 없었으므로 당시 재생 불가는 codec 실패로 단정하지 않는다.

`expo-video ~57.0.3`은 platform adapter 안에서만 사용한다. 재생 탭 후 MD4와 기존 인증 분리 GET으로 받은
앱 소유 MP4를 native player에 연결한다. Native 기본 컨트롤·닫기만 제공하고 background·계정/화면 이탈 시
중단·정리한다. 서버 계약과 기존 OS 저장 동작은 유지하며, 최신 검사 결과는 [M11 evidence](evidence/M11.md)를 따른다.

같은 app devShell에서 검증했다. Online Expo 검사는 기존 SDK 패키지 18개의 새 patch를 권고해 실패했다.
고정 SDK의 로컬 manifest 검사와 최신 upstream 검사를 구분하며 SDK 전체/라우터 패치를 임의 갱신하지 않는다.
새 player는 이전 바이너리에 없으므로 별도 승인 후 양 플랫폼 clean prebuild·재빌드·설치와 사용자 재생/소리
확인이 필요하다. 이번 영상 재생 수정에서는 native 빌드·서버 배포·commit/push를 실행하지 않았다.

### Native UI 도구 채택과 `expo-image` 재빌드 — 2026-09-15

사용자 결정으로 `@expo/ui`, `expo-symbols`, `expo-glass-effect`를 제품 UI 도구로 추가하고 화면을
platform semantic color·native Stack 헤더 기준으로 재구성했다(배경은 [ADR 0005](adr/0005-native-ui-toolkit-adoption.md)).
세 패키지는 기존 development build에 이미 linked돼 있어 재빌드 없이 확인했고, 같은 날 후속 승인으로
`expo-image ~57.0.5`를 추가해 미디어 이미지 표시를 교체한 뒤 아래 순서로 양 플랫폼을 재빌드했다.
고아 화면 `chat-rooms-screen.tsx`와 `chat-controls.tsx`는 같은 승인으로 삭제했다.

| 명령                                                                                        | 결과                                                                  |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `bun run toolchain:check:native`                                                            | prebuild 전 45 PASS / 0 FAIL, 빌드 후 gradle daemon 정지 뒤 45 PASS   |
| `CI=1 bun run expo:prebuild:clean --no-install --skip-dependency-update react,react-native` | exit 0; ignored `ios/`, `android/` 재생성                             |
| `CI=1 bun run expo:run:android --device jamye_pixel_9_api_36`                               | exit 0; BUILD SUCCESSFUL, 설치·실행                                   |
| `CI=1 bun run expo:run:ios --device <simulator-udid>`                                       | xcodebuild 0 errors / 1 warning, 설치 완료. 마지막 `simctl openurl`만 |
|                                                                                             | LSApplicationWorkspaceErrorDomain 115로 실패해 수동으로 실행          |

iOS 빌드는 `pod install`이 ASCII-8BIT locale에서 `Unicode Normalization` 오류로 한 번 실패해
`LANG`/`LC_ALL=en_US.UTF-8`을 export한 뒤 재실행했다. `expo-doctor`가 보고한 `expo-router` 하위의
중복 설치(`@expo/ui`, `expo-symbols`, `expo-glass-effect`)는 중첩 사본을 제거하고 frozen install로
정리했으며, 남은 doctor 실패는 SDK 패키지 17개의 새 patch 권고로 이전 기록과 같은 성격이다. 재빌드 뒤
Android Emulator와 iOS Simulator에서 dev client가 새 바이너리로 실행되고 대화 화면의 이미지·영상
썸네일이 `expo-image`로 표시되는 것을 확인했다. Commit/push는 실행하지 않았다.

iOS Simulator에서 앱이 흰 화면으로 멈춘 사례는 앱 코드가 아니라 시뮬레이터의 pasteboard 서비스가
동기 XPC 응답을 하지 않아 메인 스레드가 키보드 preload 경로에서 대기한 것이었다.
`xcrun simctl spawn <udid> launchctl kickstart -k system/com.apple.pasteboard.pasted`로 복구했다.

### 영상 미리보기 안정화와 포스터 도입 — 2026-09-15

사용자 승인으로 영상 미리보기 신뢰성을 3단계로 개선했다. 즉시: 실패 사유를
`media.video-thumbnail.failed`(stage/code)로 로깅, 120초 워치독을 작업 시작 시점으로 이동,
프레임 추출 0.5초→실패 시 1.5초 재시도, 가시성 5초 그레이스, mediaId 캐시와 재시도 3회.
중기: 미리보기·재생이 `media-object-cache.ts`(retain count, 60초 보존)로 다운로드를 공유.
근본: 발신 단말이 첨부 시 로컬 영상에서 JPEG 포스터를 만들어 별도 업로드로 올리고
`posterUploadId`로 영상 finalize에 연결(`media-upload-controller.ts` sub-pipeline); 실패해도
영상 전송은 막지 않는다. 수신 단말은 `posterMediaId`가 있으면 JPEG만 받고 없으면 기존 로컬
추출로 fallback한다. 배경은 [ADR 0006](adr/0006-media-video-posters.md), 서버 측은
jamye-server [ADR 0009](../../jamye-server/docs/adr/0009-media-posters.md)를 따른다.

계약 intake는 `bun tools/contracts/intake-server-contract.mjs`로 `poster_upload_id`/
`poster_media_id`를 반영했다(`server_commit: "dirty"`, `contract_version: "1"` 불변).
`bun run check:code`(typecheck/lint/format/check:architecture/coverage) PASS를 확인했다.
Native 입력 변경이 없어 이번 세션은 clean prebuild·재빌드를 실행하지 않았다. 실기기 포스터
송수신 E2E는 서버 배포 후로 미룬다. 서버가 배포되면 배포 commit 기준으로
`bun tools/contracts/intake-server-contract.mjs`를 다시 실행해 `source_git_revision`을 배포 commit으로
갱신하고 `bun tools/contracts/check-server-contract.mjs`를 통과시킨 뒤 E2E를 수행한다.

<!-- oma-docs:ignore-start -->

`upstream_server_commit: "dirty"`는 서버 저장소의 `src/contract_generation/provenance.json`이
고정한 라벨이라 그대로 남는다(2026-09-15 배포 commit `97d3d26`으로 재intake 완료).

<!-- oma-docs:ignore-end -->

### realtime 발신자 표시·첨부 즉시 반영, Android 첨부 시트 오류 우회 — 2026-09-16

서버 defect 수정에 맞춰 두 가지를 반영했다. `chat-composer.tsx`의 첨부 시트 `ListItem`
두 개(사진·동영상, 음성)에 가용성(`canAddImageOrVideo`/`canAddAudio`)을 담은 `key`를
추가해 availability 변경 시 in-place prop update 대신 remount가 일어나도록 했다.
`@expo/ui` Android `ListItem.android.tsx`가 `onPress`가 사라지는 업데이트를 diff할 때
`modifiers`에 `undefined`를 넘겨 `expo-modules-core`의 `ListTypeConverter.convertFromDynamic`이
크래시하는 업스트림 버그 우회다(업스트림 이슈 미등록, 2026-09-15 기준). 서버의
`CanonicalMessage.sender_nickname`/`sender_avatar_url`(optional-nullable) 추가를
`intake-server-contract.mjs`로 재-intake했고, realtime/canonical upsert
(`connected-chat-repository.ts` `mergeMessage`)는 들어오는 값이 non-null이면 채택하고
null이면 기존 저장된 닉네임/아바타를 보존한다(history 경로는 변경 없이 항상 덮어씀).
native 입력 변경이 없어 재빌드는 하지 않았다.

## M12 알림·푸시 로컬 검증 — 2026-09-16

알림함·Expo 푸시(N1/N2, P2/P3/P4) 구현은 `expo-notifications`/`expo-device`를
`tests/__mocks__/expo-notifications.ts`·`tests/__mocks__/expo-device.ts`로 대체해 전량 mocked
상태로 검증했다(신규 16개 테스트 파일, `bun run check:code` 145 suites / 1,573 tests PASS).
native 모듈 추가로 인한 clean prebuild·재빌드와 실기기 수신 확인은 별도 승인 이후로 미룬다.
자격 증명 준비·로컬 mock 테스트 실행·재빌드 절차는 [Expo 푸시 개발 연결](push-development.md)에,
자동 검사와 실기기 증거의 분리 기록은 [M12 evidence](evidence/M12.md)에 있다.

## M17 라운드 2 (A) 의존성·ANR·기기 수용 기록 — 2026-10-01-2026-10-06

M17 (A) 앱 출시 blocker의 구현과 기기 수용 기록이다. 이 기록 시점(2026-10-06)에 변경은 모두 작업
트리에 있고 VERIFY·REFINE·SHIP 리뷰와 커밋이 남아 있다. 자동 검사와 기기 증거의 상세는
[M17 evidence](evidence/M17.md)에, 이 라운드가 M18로 넘긴 작업은 [로드맵](roadmap.md)의 M17·M18 절에
있다. 아래 수치는 해당 시점의 관찰이며 현재 실행의 PASS로 재사용하지 않는다.

### 의존성 정렬과 audit 정리 (사용자 결정 A1)

별도 의존성 승인(A1) 범위 안에서만 바꿨다. `CI=1 bunx expo install --fix`가 `expo install --check`의
기대 버전으로 Expo SDK 57 패키지 22개를 맞췄다.

| 패키지                   | 이전                     | 이후       |
| ------------------------ | ------------------------ | ---------- |
| `@expo/ui`               | `57.0.17`                | `~57.0.21` |
| `expo`                   | `~57.0.21`               | `~57.0.26` |
| `expo-auth-session`      | `~57.0.11`               | `~57.0.13` |
| `expo-constants`         | `~57.0.17`               | `~57.0.20` |
| `expo-crypto`            | `~57.0.2`                | `~57.0.3`  |
| `expo-dev-client`        | `~57.0.18`               | `~57.0.19` |
| `expo-file-system`       | `~57.0.6`                | `~57.0.7`  |
| `expo-font`              | `~57.0.3`                | `~57.0.4`  |
| `expo-glass-effect`      | `57.0.2`                 | `~57.0.4`  |
| `expo-image-manipulator` | `~57.0.16`               | `~57.0.20` |
| `expo-image-picker`      | `~57.0.16`               | `~57.0.20` |
| `expo-linking`           | `~57.0.9`                | `~57.0.11` |
| `expo-notifications`     | `~57.0.20`               | `~57.0.21` |
| `expo-router`            | `~57.0.20`               | `~57.0.24` |
| `expo-secure-store`      | `~57.0.3`                | `~57.0.4`  |
| `expo-sharing`           | `~57.0.18`               | `~57.0.22` |
| `expo-splash-screen`     | `~57.0.8`                | `~57.0.9`  |
| `expo-sqlite`            | `~57.0.2`                | `~57.0.3`  |
| `expo-symbols`           | `57.0.2`                 | `~57.0.3`  |
| `expo-system-ui`         | `~57.0.3`                | `~57.0.4`  |
| `expo-video`             | `~57.0.3`(설치 `57.0.4`) | `~57.0.5`  |
| `expo-web-browser`       | `~57.0.2`                | `~57.0.3`  |

위 표 밖의 변경은 다음과 같다.

- devDependency `@react-native/metro-config`를 React Native와 같은 `0.86.3`으로 정확히 고정해
  추가했다. 그러면 `react-native-worklets`의 peer가 Expo와 같은 Metro 0.84.5 계열로 채워져, 중첩
  Metro 0.87.0 트리와 `image-size` 1.2.1이 의존성 트리에서 빠진다.
- `expo-asset`을 `~57.0.18`로 직접 선언했다. 같은 57.0.18이 `expo`의 dependency로 이미 설치·autolink
  되어 있었지만, expo-doctor가 `expo-audio`의 필수 peer를 직접 선언하라고 요구했다("Native module
  peer dependencies must be installed directly"). 선언만 추가했고 패키지 트리와 앱 번들은 바뀌지
  않는다. "새 런타임 dependency를 추가하지 않는다"는 A1 조건에 대한 범위 조정이며 사용자에게
  보고했다.
- `@expo/ui`·`expo-glass-effect`·`expo-symbols`는 정확한 버전 고정에서 다른 Expo 패키지와 같은 `~`
  범위(`expo install --fix`의 표준 형식)로 바뀌었다. 실제 버전은 `bun.lock`이 고정하고, expo-router가
  caret 범위로 의존하는 세 패키지의 중첩 사본은 없다.
- `expo install --fix`가 안내한 `expo-sharing`·`expo-video`·`expo-asset` config plugin 등록은 반영하지
  않았다. 설치된 plugin 소스를 읽어 세 plugin 모두 option이 없으면 아무것도 하지 않음을 확인했고,
  등록하지 않아도 native 설정이 같다.
- `bun install`로 lock 전체를 다시 해석하면 A1 범위 밖 패키지 74개가 바뀌고 Metro가 두 벌로 갈라져
  그 결과를 버렸다. 대신 기준 lock에서 필요한 항목(아래 audit 대상, `@expo/metro-runtime` 중복
  제거)만 레지스트리가 해석한 값 그대로 옮겼다. 그 시점의 lock에서 `rm -rf node_modules` 뒤
  `bun run deps:install:frozen --ignore-scripts`(1017 packages)가 lock을 바꾸지 않았다.

`bun audit`은 사전 14건(high 10, moderate 4)에서 의존성 정리 직후(2026-10-01) 0건("No vulnerabilities found")이
됐다. override는 쓰지 않았다.

| 대상            | 이전 audit 대상 경로                                                                                                     | 정리                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| fast-uri        | `ajv` 경로, 앱 번들 `>=3.0.0 <3.1.7`                                                                                     | lock 갱신으로 `3.1.8`                                                              |
| brace-expansion | root 1.1.18, `@redocly/openapi-core` 2.1.4, `@expo/fingerprint`·`@typescript-eslint/typescript-estree`·`glob` 아래 5.0.9 | 같은 메이저의 수정판 `1.1.21`, `2.1.7`, `5.0.12`                                   |
| image-size      | Expo Metro, react-native, `react-native-worklets` 경로의 2건                                                             | 의존성 트리에서 제거(위 `@react-native/metro-config`). 수용 위험으로 남기지 않았다 |

brace-expansion을 5.x 하나로 override하면 minimatch 3·5를 쓰는 eslint·jest·redocly가 깨지기 때문에
메이저별 수정판으로 갔다. fast-uri는 앱 번들의 Ajv 경로에 있어 계약 검증 테스트로 다시 확인한다.

image-size가 트리에서 빠졌으므로 로컬 패치 파일(`image-size@1.2.1`용)과 `patchedDependencies` 항목을
지웠다. 위 2026-09-09 기록의 image-size High 2건은 이 정리로 해소됐다.
`tests/quality/image-size-security.test.ts`는 image-size가 앱과 Metro의 패키지 범위에서 resolve되지
않는지, 그리고 Expo Metro 자체 `lib/imageSize` 파서가 정상 PNG·JPEG·WebP·TIFF·SVG의 치수를 읽고 SVG
헤더 스캔에 상한이 있는지를 별도 프로세스에서 확인하도록 다시 썼다.

expo-router 57.0.24의 `node_modules/expo-router/build/fork/NavigationContainer.js`에도 마운트 전 initial link 상태 갱신
문제가 그대로 남아 있었다. 그래서 같은 의미의 패치를 `patches/expo-router@57.0.24.patch`로 다시
만들고(57.0.20 패치와 내용이 같고 diff 헤더 한 줄만 다르다) `patchedDependencies` key를 새 버전으로
옮겼다. 설치된 파일에 패치가 적용됐는지는 architecture checker와 그 테스트가 설치 파일 내용으로
확인한다. checker의 `APPROVED_DEPENDENCIES`·`APPROVED_DEV_DEPENDENCIES`·
`APPROVED_PATCHED_DEPENDENCIES`·패치 파일 sha 상수와 거울 테스트도 새 상태에 맞췄다. 현재
`patchedDependencies`는 `expo-router@57.0.24`와 `query-string@7.1.3` 둘이다.

검증 기록(2026-10-01): `bun run check:expo`에서 `expo install --check`가 "Dependencies are up to
date", expo-doctor가 21/21 통과했다.

### 재빌드와 smoke (C6)

네이티브 모듈 버전이 바뀌어 6절의 전체 순서를 따라 clean prebuild와 두 플랫폼 dev client 재빌드를
했다(`CI=1 bun run expo:prebuild:clean --no-install --skip-dependency-update react,react-native`,
`android:avd:verify`·`android:avd:start`·`android:gradle:stop`·`toolchain:check:native`,
`CI=1 bun run expo:run:ios --device <시뮬레이터>`, `CI=1 bun run expo:run:android`). 모두 exit 0이었고
Metro 번들은 Android 2540 modules, iOS 2596 modules였다. 로그인 유지, 그룹 목록, 대화는 두 플랫폼 모두
통과했다. iOS 미디어 뷰어의 닫기 실패(F-1)와 Android 음성 재생 보류(F-2)가 이 smoke에서 나왔고 아래
기기 수용에서 처리했다.

### production identity 확인

`APP_VARIANT=production` 경로는 구현했지만 production prebuild·빌드·서명은 하지 않는다(사용자 결정
A5). 설정은 native 폴더가 없는 임시 사본에서 읽기 전용으로만 확인한다.

```sh
APP_VARIANT=production bunx expo config --type introspect --json
```

저장소 작업 트리에서 실행하면 기존 development `ios/` 파일을 base로 읽어 production의
`aps-environment`가 development로 보인다. 그래서 판정은 깨끗한 사본 기준으로 한다. 이 확인에서
production은 이름 `잼얘좀`, iOS bundle id·Android package `com.ridewithmin.jamyeapp`, URL scheme
`jamye`와 bundle id, associated domains `applinks:jamye-api.ridewithmin.com`(`?mode=developer`
없음), `aps-environment`=production, `extra.appVariant`=production이고 개발 scheme `exp+jamye-app`은
0건이었다. `expo-dev-client` plugin을 목록에서 빼기만 하면 prebuild의 legacy auto-plugin이 설치된
패키지를 다시 적용해 scheme이 남기 때문에, production은 `["expo-dev-client", { addGeneratedScheme:
false }]`를 명시한다.

### Android 시작 ANR 분석 (사용자 결정 A3)

결론부터: **이번 dev build 실험에서 ANR은 재현되지 않았다.** 원인이 "규명됐다"고 기록하지 않는다. 앱 코드는
시작 지연의 원인에서 배제했고, 남은 main thread 지연은 expo-dev-launcher의 debug 경로로 추정한다.

- 재현: 에뮬레이터 `jamye_pixel_9_api_36` dev build에서 cold start를 세 방식으로 2회씩 6회 반복했고,
  `[startup-timing]` 계측을 넣은 뒤 같은 방식으로 5회를 다시 확인했다.

  | 실행 방식                                    | 관찰                                                                                                       |
  | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
  | `am start -W -n …/.MainActivity`(구성요소만) | dev-launcher 홈(`DevLauncherActivity`)만 뜨고 앱 JS는 실행되지 않는다. 2.0-2.5초                           |
  | `am start -W -a MAIN -c LAUNCHER -n …`       | `.MainActivity` 1.4-1.6초, dev launcher가 마지막 번들로 재시작한 뒤(두 번째 Displayed 0.75-0.89초) JS 시작 |
  | 런처 아이콘                                  | `Displayed` +1.6초, 위와 같은 순서(`am start -W`로 잴 수 없어 `Displayed` 값을 기록)                       |

  재현 6회와 재확인 5회(한 회차는 logcat 수집 실패로 판정 보류)에서 `ANR in`, `Application Not
Responding`, `Input dispatching timed out`이 없었고 `dumpsys activity exit-info`에도 새 ANR 항목이
  없었다. M6(2026-09-09)의 `BIND APPLICATION ANR`은 일반 실행 경로에서 재현되지 않았다.

- 남은 지연: 앱 main thread에 `Choreographer: Skipped 30-39 frames`(약 530-600ms)가 반복된다. JS가
  실행되지 않는 방식 1에서도 같은 크기로 나오므로 React·앱 코드와 무관한 native 작업이다. 후보는
  `expo-dev-launcher/android/src/debug` 아래의 `DevLauncherController.initialize`(스플래시를 reflection으로
  숨기고 `DependencyInjection.init`이 `SharedPreferences`를 동기로 여는 작업)와 모드 전환의
  `runBlockingOnMainThread` + `host.destroy()`다. 어느 한 줄이 시간을 차지하는지는 method-level trace
  없이는 확정할 수 없다.
- release에는 이 경로가 없다. `src/debug/**` 소스셋은 release 빌드에 컴파일되지 않고
  `MainApplication.kt`에도 `devlauncher` import가 없다. 근거는 소스셋 경계이며 release 측정값이 아니다.
- 앱 코드(MediaProvider의 `sweepOwnedTempFiles()` 동기 I/O)는 원인이 아니다. 그 코드는 main thread가
  아니라 JS thread(tid가 다르다)에서 돌고, Choreographer 경고가 JS `Running "main"`보다 1.4초 이상
  먼저 찍히며(MediaProvider는 그 뒤에야 마운트된다), 계측값도 1-9ms다.
- 코드 변경: 동작을 바꾸지 않았다(재현 없이 추측성 수정을 하지 않는다). 개발 중에만 쓰는
  `__DEV__` 가드 로그 `[startup-timing]` 세 가지를 추가했다 — `start_to_first_screen`(trigger
  `timeout`·`restore`)과 `session_restore`(`session-provider.tsx`), `temp_sweep`(trigger `startup`·
  `teardown`, `media-provider.tsx`). 값은 ms 숫자와 고정 문자열뿐이고 개인 값은 없다. 읽는 방법은
  `adb logcat | grep '\[startup-timing\]'` 또는 Metro 로그다.
- 계측값(에뮬레이터 dev build): `session_restore` 2.3-3.7초, `start_to_first_screen` 2.5-3.3초,
  `temp_sweep` 1-9ms. 복원이 3초 splash 안전 시간(`SPLASH_SAFETY_TIMEOUT_MS`)을 넘으면 `timeout`으로
  splash가 먼저 내려가 로그인 화면이 잠깐 보일 수 있다.
- 세션 중 관찰한 ANR·크래시: 모두 dev-client 링크를 처리하는 debug 경로다. 2026-10-01 23:11에 치환되지
  않은 `url=${MAESTRO_METRO_URL}`로 `openLink`한 첫 Maestro 실행이 약 2시간 된 dev 프로세스에서
  `/data/anr` trace와 `APP CRASH(EXCEPTION)`을 냈고, 10-02 00:10에는 유효한 링크를 받은 프로세스가
  크래시한 뒤 잘못된 `url=` VIEW intent의 cold start가 M6와 같은 `BIND APPLICATION ANR`로 끝났다. 재시험
  3건(깨끗한 상태의 잘못된 `url=`, 접근 불가 URL, 실행 중 앱에 유효 링크)은 재현되지 않아
  결정적이지 않다. 크래시 stack은 실험 사이의 `adb logcat -c`로 지워져 확보하지 못했고 ANR trace
  파일은 production 이미지라 `adb root`가 안 돼 읽지 못했다. 같은 실험을 다시 한다면
  `adb logcat -v threadtime > file`을 실험 내내 연속 수집한다. 그래서 Maestro flow는 시작 때 앱을
  종료(`stopApp`)한다.
- 남은 한계: release(또는 release 유사) 빌드의 cold start 측정은 하지 않았다. 새 승인이 필요한 항목이며
  M18 또는 별도 승인으로 남는다. Choreographer 경고는 6회 중 4회만 나와 비결정적이다.

### 기기·접근성 수용 결과 (사용자 결정 A4·A10·A19)

기기는 사용자가 조작하고 coordinator가 기록과 결함 수정을 맡았다. 대상은 iPhone 15 Pro(iOS 27.0.1)
실기기, iOS 시뮬레이터(iPhone 17 Pro, iOS 26.5), Android 에뮬레이터(`jamye_pixel_9_api_36`, API 36,
TalkBack 16.0)다. 실기기는 2026-10-05와 10-06에 두 차례 일괄 검증했고, 계정 삭제 항목은 사용자가 본인
계정으로 삭제와 복구까지 직접 진행했다.

| 항목                        | 결과                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple 로그인 오류 안내      | PASS. "로그인 실패" 알림에 문구와 `닫기`·`다시 시도` 버튼이 나온다(비행기 모드)                                                                       |
| 로그인(실기기)·세션 유지    | PASS(카카오). 세션 유지 PASS                                                                                                                          |
| 세션 복원 시간(실기기)      | iPhone 첫 실행 뒤 복원 `start_to_first_screen` 1602/1113/823ms, `session_restore` 1570/1079/785ms. 로그에 시각이 없어 어느 실행인지는 특정하지 못했다 |
| 200% 텍스트                 | 실기기 로그인·대화방 부제·composer·그룹 정보 연필 PASS(2차). 시뮬레이터·에뮬레이터 캡처 확인                                                          |
| 동작 줄이기                 | PASS(실기기에서 바로 이동). 시뮬레이터는 프레임 분석 도구가 없어 시각 확인을 생략했다                                                                 |
| 이미지 뷰어(F-1)            | PASS. 닫기·공유가 Dynamic Island 아래에 있고 눌러서 닫힌다                                                                                            |
| 햅틱                        | PASS(녹음 시작·종료)                                                                                                                                  |
| 통화 중단                   | PASS(2차)                                                                                                                                             |
| Apple 재인증 취소·계정 삭제 | 사용자가 Apple·카카오 계정으로 삭제와 복구까지 직접 진행해 완료. coordinator는 삭제를 완료하지 않았다                                                 |
| F-8 scene 전환              | PASS                                                                                                                                                  |
| VoiceOver                   | 필수 기능이 아니라 넘어갔다(A19). iOS 숨긴 heading은 그대로 둔다                                                                                      |
| Android TalkBack 라벨       | PASS(노드 트리). 제스처 이동은 자동화가 모두 실패해 수동 확인으로 남겼다(미검증)                                                                      |

무음 모드 재생은 이 표에 별도 PASS로 기록하지 않았다. 실기기 음성 재생은 F-9 해소 뒤 "다시 재생"(F-11)
확인으로 통과했다.

기기에서 재현해 고친 결함은 다음과 같다. 모두 회귀 테스트를 RED에서 GREEN으로 확인했다.

| ID   | 증상                                                                       | 원인과 조치                                                                                                                                                                                        |
| ---- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1  | iOS 이미지 뷰어 상단 닫기·공유 버튼이 상태 표시줄 아래에 깔려 닫히지 않음  | `fullScreenModal`이 `SafeAreaView`의 provider 경로를 끊어 top inset이 0이었다. `media-viewer-screen.tsx`가 `useSafeAreaInsets()`로 inset을 읽는다                                                  |
| F-3  | Android 200% 텍스트에서 그룹 정보 이름 변경 연필이 잘림                    | expo-symbols Android `SymbolView`가 글리프를 글자 크기 배율이 적용되는 `Text`로 그려 상자를 넘쳤다. `symbolViewSizing`이 Android에서 `size / fontScale`을 넘기고 상자를 고정한다(모든 `AppSymbol`) |
| F-4  | TalkBack 대화방 첫 포커스가 `Navigate up`, 숨긴 heading이 제목을 중복 낭독 | RN Fabric의 `"focus"` 이벤트는 TalkBack이 입력 요소가 아닌 view에서 무시한다. 숨긴 heading과 포커스 요청을 iOS에서만 렌더하고 Android는 TalkBack 기본 순서를 따른다                                |
| F-7  | iOS 뒤로 버튼의 VoiceOver 이름이 `(tabs)`(route group 이름)                | 루트 `(tabs)` 화면에 화면에 보이지 않는 title "이전 화면"을 줬다                                                                                                                                   |
| F-10 | 첨부(음성·사진·동영상)를 길게 누르면 공유 시트와 메시지 메뉴가 함께 열림   | iOS native `ContextMenu`와 첨부의 RN `onLongPress`가 둘 다 반응했다. 길게 누르면 메뉴(`공유`, 본인 메시지는 `삭제`)만 열고 Android는 첨부가 메뉴를 연다(`openRef`)                                 |
| F-11 | 끝까지 재생한 음성을 다시 누르면 재생되지 않음                             | expo-audio가 끝난 clip을 끝 위치에 둔다. 끝에서 0.05초 이내면 `seekTo(0)` 뒤 재생한다(버블·composer 미리듣기)                                                                                      |
| C15  | Android snackbar 4줄 메시지가 160dp 띠에 잘림                              | 띠 높이를 `160 * max(1, fontScale)`로 바꿨다                                                                                                                                                       |
| C15  | iOS 대화 header 부제가 200%에서 내비게이션 바 아래로 내려감                | 제목은 Dynamic Type 배율 상한 2.0, 부제는 상한 1.2에 한 줄로 고정(`HeaderTitleButton`, iOS만)                                                                                                      |
| C15  | iOS 입력창이 200%에서 120pt capsule 위로 넘침                              | 최대 줄 수를 `clamp(floor(120 / (22 × fontScale)), 1, 5)`로 정했다(1x는 5줄, 그보다 크면 줄고 넘치면 필드 안에서 스크롤)                                                                           |

F-2(Android 음성이 즉시 끝 위치로 감)는 결함이 아니었다. iOS 시뮬레이터 마이크로 만든 무음 AAC(2 kbps)와
F-11의 끝 위치 재생이 겹친 현상이었고, 실기기 iPhone이 녹음한 음성(0:08)은 Android 에뮬레이터에서
정상 재생됐다. F-9(실기기 녹음이 거의 빈 파일, audio bytes 18)는 사용자가 다시 확인해 녹음 문제가
모두 해결됐다고 판정했다. 원인은 확정하지 않았다. 가설은 녹음 중 expo-video가 audio session category를
`.playback`으로 바꾼다는 것이고(공개 이슈 expo/expo#36890, #41656과 같은 계열), A/B 재현은 하지 않았다.

#### iOS 27 실기기 실행 즉시 종료 (F-8)

iOS 27.0.x 실기기에서 dev client가 시작하자마자 종료됐다. 10-02에 이를 Metro·로컬 네트워크 문제로 본
판단은 틀렸다. 기기 crash log(2026-10-02, 10-05 모두)가 같은 원인을 가리킨다.

- 원인: `EXC_BREAKPOINT`, UIKit `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`. iOS 27
  SDK(Xcode 27)로 빌드한 앱이 UIScene life cycle을 쓰지 않으면 iOS 27에서 실행되지 않는다. SDK 57
  prebuild 템플릿은 AppDelegate가 window를 직접 만들고 scene manifest가 없다. iOS 26.5 시뮬레이터에서는
  드러나지 않았고, 같은 SDK로 만든 release 빌드도 iOS 27에서 같은 이유로 막힌다.
- 조치(사용자 결정 A18): SDK 57을 유지하고 로컬 config plugin `tools/expo/with-ios-scene-lifecycle.cjs`를
  `app.config.ts`의 두 variant에 등록했다. SDK 58 템플릿(`expo-template-bare-minimum` 58.0.12)의
  `UIApplicationSceneManifest`·`SceneDelegate.swift`(expo 57.0.26의 `ExpoAppSceneDelegate` 상속)·
  AppDelegate(`ExpoReactNativeFactoryProvider` 채택, window 생성과 `startReactNative` 제거)를 이식한다.
  템플릿이 바뀌면 추측하지 않고 prebuild를 실패시키고, `--clean` 없는 재실행에도 결과가 같다. 테스트는
  `tests/config/ios-scene-lifecycle-plugin.test.ts`와 `tests/config/app-config.test.ts`, checker의
  `APPROVED_IOS_SCENE_LIFECYCLE_PLUGIN`이다.
- 확인: iOS 시뮬레이터 재빌드에서 세션 복원과 warm deep link(scene URL 이벤트 → `+native-intent`)가
  동작했고, 실기기(iOS 27.0.1) 재빌드·설치·실행에서 프로세스가 유지되고 새 crash log가 없었다.
  Android는 영향이 없다(iOS mod만 있다).
- 후속: SDK 58이 stable(`latest`)이 되면 업그레이드하고 이 plugin을 지운다. 이 기록 시점(2026-10-05)에
  58은 npm `next` 태그였고 React Native 0.88.0-rc.3을 썼다.

#### 후속 과제로 남긴 관찰

- F-5: iOS 최대 텍스트 크기(약 357%)에서 로그인 소개 문구와 버튼이 겹친다(200% 기준에서는 재현되지
  않음).
- F-6: access token이 만료된 뒤(서버 기본 TTL 900초) 오프라인이나 불안정한 네트워크에서 앱을 처음 열면
  `refresh()`가 fail-closed로 세션을 지워 로그아웃된다. 보안 쪽을 택한 설계라 바꾸지 않았고, 요청이
  서버에 닿지 않은 경우의 세션 유지나 서버의 짧은 재사용 grace window를 후속으로 논의한다.
- 2026-10-06 재감사(A22): 새로 공개된 advisory로 dev/build 도구 경로(expo CLI, Metro, jest, postcss)에 high 4건이
  나왔다. 버전은 10-01 lock과 같았다.
  - lock을 같은 메이저 안에서 정밀 교체했다: compression 1.8.1→1.8.2, source-map-js 1.2.1→1.2.2.
    - compression 1.8.2가 요구하는 `destroy@1.2.0`은 이미 root에 같은 integrity로 있다.
    - checker `APPROVED_BUN_LOCK_SHA256`을 갱신했다.
  - braces(<=3.0.3)와 node-forge(<=1.4.0)는 npm 최신 버전이 곧 영향 범위라 수정판이 없다. 앱 번들에 들어가지 않는
    dev 도구 경로이므로 수용 위험으로 두고 수정판이 나오면 다시 감사한다.
  - 결과: `bun audit` 2건(high 2), `check:code` 통과(2416 tests), `check:expo` 21/21
- F-7b(결함 아님, A21에서 확인): 주제 상세 뒤로 버튼의 시스템 문구는 기기 첫 언어를 따른다.
  - 한국어가 첫 언어인 시뮬레이터에서는 Info.plist 변경 없이도 `뒤로`였다.
  - 영어가 첫 언어인 기본 시뮬레이터에서는 Korean-only localization(`CFBundleDevelopmentRegion: ko`,
    `CFBundleLocalizations: ["ko"]`)을 넣어도 `Back`이었다.
  - 효과가 없어 config 변경은 되돌렸다.
- SDK 58 업그레이드와 scene lifecycle plugin 제거.
- Android snackbar가 200%에서 화면 하단보다 조금 위에 뜬다(Compose `SnackbarHost`가 띠 위쪽에 붙음,
  `align` modifier로 하단 정렬하는 안).
- Android: 스택 header 제목(그룹·알림함·계정·그룹 정보)이 글자 크기를 따라 커지지 않는다. composer가
  4줄로 커지면 목록의 마지막 메시지 아래쪽이 가린다.
- iOS: 큰 글자에서 알림함 행의 본문 열이 오른쪽 시각 열 때문에 좁아진다. 계정 화면의 dev 전용
  섹션은 진단 문구가 다음 행과 겹친다.
- F-9의 원인 미확정(위).

## 4. Dependency와 toolchain script

| 명령                             | 분류        | 결과와 선행 조건                                                  |
| -------------------------------- | ----------- | ----------------------------------------------------------------- |
| `bun run deps:install:frozen`    | 상태 변경   | `bun.lock`을 바꾸지 않고 ignored `node_modules/` 복원             |
| `bun run toolchain:flake`        | Nix 검사    | flake 평가·realization, Nix cache/store 사용 가능                 |
| `bun run toolchain:check`        | 읽기 전용   | devShell, Xcode, Android SDK와 exact version 진단                 |
| `bun run toolchain:check:native` | strict 검사 | Android Studio 종료, Gradle daemon 없음, project AVD boot 필요    |
| `bun run check:toolchain`        | 복합 검사   | flake → 기본 toolchain 진단                                       |
| `bun run android:gradle:stop`    | 상태 변경   | generated `android/`와 project 전용 `GRADLE_USER_HOME`에서만 실행 |

`toolchain:check:native`는 package나 AVD 파일을 만들지 않지만 연결 target을 확인하면서 Nix ADB
server를 시작할 수 있다. 이전 Android build가 Gradle daemon을 남겼다면 generated native
directory가 존재할 때 다음 exact recovery를 별도로 실행한 뒤 strict 검사를 다시 수행한다.

```sh
bun run android:gradle:stop
```

그다음 같은 devShell에서 strict 검사를 재시도한다. Boot된 project Emulator는 그대로 둔다.
Nix/toolchain 설정이 바뀌었거나 환경이 오염된 경우에만 해당 세션을 종료하고 프로젝트 루트에서
`nix develop .`로 다시 진입한다.

```sh
bun run toolchain:check:native
```

`android:gradle:stop`은 devShell이 설정한 project 전용 `GRADLE_USER_HOME`의 daemon만 대상으로
한다. 이 복구는 strict 검사의 읽기 전용 성질을 보존하기 위해 자동으로 연결하지 않는다.
Gradle daemon 복구 중에는 project AVD와 Emulator를 종료하지 않는다. Strict 검사는 boot된
project Emulator를 별도 선행 조건으로 확인한다.

Dependency 추가·갱신은 일반 검사 script가 아니다. 별도 dependency 승인을 받은 exact package만
다음처럼 설치하고 manifest와 lock diff를 검토한다.

```sh
bunx expo install <approved-package>
bun run expo:install:check
bun run deps:install:frozen
```

`expo:install:check`의 exact command는 `CI=1 expo install --check`다. 여기서 `CI=1`은 앱
설정값이 아니라 Expo CLI의 대화형 수정 prompt를 끄는 command execution guard다. 호환
version이 어긋나면 목록을 출력하고 실패할 뿐 호환 version을 설치하지 않는다. 실제
`expo install --fix` 또는 package 갱신은 별도 dependency 승인 없이는 실행하지 않는다.

## 5. Nix-owned Android AVD lifecycle

Project AVD는 `jamye_pixel_9_api_36` 하나다. 다음 명령은 모두 devShell에서 실행한다.

| 명령                            | 분류        | 동작                                              |
| ------------------------------- | ----------- | ------------------------------------------------- |
| `bun run android:avd:verify`    | 읽기 전용   | active Nix SDK와 AVD 선언 일치 확인               |
| `bun run android:avd:create`    | 상태 변경   | AVD가 완전히 없을 때만 최초 생성                  |
| `bun run android:avd:reconcile` | 상태 변경   | 정지된 complete AVD의 선언 소유 key만 갱신        |
| `bun run android:avd:start`     | 장시간 실행 | Nix Emulator를 분리 실행하고 PID와 log 출력       |
| `bun run android:avd:stop`      | 상태 변경   | 같은 이름의 실행 target이 정확히 하나일 때만 종료 |

`android:avd:stop`은 userdata나 snapshot을 지우지 않는다. 일치하는 target이 없거나 둘 이상이면
범위가 불명확하므로 아무 Emulator도 종료하지 않고 실패한다. Delete, wipe, force, arbitrary path
명령은 제공하지 않는다.

정상적인 최초 준비 순서는 다음과 같다.

```sh
bun run toolchain:check
bun run android:avd:verify
# verify가 AVD 부재를 정확히 보고한 경우에만
bun run android:avd:create
bun run android:avd:start
bun run android:gradle:stop
bun run toolchain:check:native
```

### 5.1 Quickboot 스냅샷 위생

`android:avd:start`는 Android Emulator의 quickboot 스냅샷(`default_boot`)을 불러온다. 이
스냅샷은 마지막으로 종료한 시점에 설치돼 있던 앱 상태를 그대로 되살리므로, 그 사이 dev
client를 다시 설치했다면(native module 추가·제거 등) 스냅샷이 오래된 APK 상태를 되살려 현재
JS 번들과 어긋날 수 있다. M16에서 `expo/modules/audio`가 없는 오래된 APK가 되살아나
`Cannot find native module 'ExpoAudio'`로 이어진 사례가 있었다([M16 evidence](evidence/M16.md)). 이 점검은 상태를 바꾸지 않는 읽기 전용 확인이며 재설치나 cold boot를 자동으로
수행하지 않는다.

```sh
bun run android:avd:start
adb shell dumpsys package dev.local.jamyeapp | grep -E "lastUpdateTime|firstInstallTime"
```

- `lastUpdateTime`이 마지막으로 dev client를 설치·재설치한 시각과 같으면 스냅샷이 최신 상태를
  되살린 것이다(stale 아님) — 추가 조치 없이 계속한다.
- `lastUpdateTime`이 그보다 오래됐으면 스냅샷이 오래된 APK를 되살린 것이다. 이 경우 다시
  설치(`bun run expo:run:android`) 또는 cold boot(스냅샷 없이 부팅)로 최신 상태를 확보한 뒤
  계속한다.

2026-09-30 M17 라운드 1 기기 검증 preflight에서 이 절차로 실제 확인했다. `lastUpdateTime`이
직전 재빌드·설치 시각과 같아 stale이 아니었고, 추가 설치나 cold boot 없이 바로 기기 검증을
진행했다. iOS Simulator는 quickboot 스냅샷이 없어 이 되살림 문제가 생기지 않는다 — 대신 아래
"기기 검증 전 확인 단계"가 iOS dev client 설치 여부만 따로 확인한다.

## 6. Expo Development Build script

| 명령                          | 분류        | 동작                                                                                                                                                                                                                                                                             |
| ----------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run expo:install:check`  | 읽기 전용   | 비대화형 Expo dependency 호환성 검사                                                                                                                                                                                                                                             |
| `bun run expo:doctor`         | 읽기 전용   | 로컬 고정 `expo-doctor` 실행                                                                                                                                                                                                                                                     |
| `bun run check:expo`          | 복합 검사   | dependency check → doctor                                                                                                                                                                                                                                                        |
| `bun run expo:start`          | 장시간 실행 | Development Client용 Metro 시작                                                                                                                                                                                                                                                  |
| `bun run expo:prebuild:clean` | 파괴적 생성 | ignored `ios/`, `android/` 삭제·재생성                                                                                                                                                                                                                                           |
| `bun run expo:run:ios`        | build       | Simulator binary build/install/open, Metro 미포함                                                                                                                                                                                                                                |
| `bun run expo:run:android`    | build       | Emulator APK build/install/open, Metro 미포함                                                                                                                                                                                                                                    |
| `bun run e2e:ios`             | 상태 변경   | 로그인된 dev client + Metro 필요. `MAESTRO_METRO_URL`/`MAESTRO_TEST_GROUP_NAME`/`MAESTRO_TEST_TOPIC_TITLE`/`MAESTRO_E2E_MESSAGE`(+선택 `MAESTRO_DEVICE`)를 셸에서 export한 뒤 실행한다 — script가 이미 `-e`로 전달하므로 `-- -e`를 덧붙이지 않는다(테스트 그룹 메시지 전송 포함) |
| `bun run e2e:android`         | 상태 변경   | 로그인된 dev client + Metro 필요. `MAESTRO_METRO_URL`/`MAESTRO_TEST_GROUP_NAME`/`MAESTRO_TEST_TOPIC_TITLE`/`MAESTRO_E2E_MESSAGE`(+선택 `MAESTRO_DEVICE`)를 셸에서 export한 뒤 실행한다 — script가 이미 `-e`로 전달하므로 `-- -e`를 덧붙이지 않는다(테스트 그룹 메시지 전송 포함) |

`expo:prebuild:clean`, 양 플랫폼 build와 runtime smoke는 각각 별도 사용자 승인 게이트다. 명령이
script로 존재한다는 사실은 실행 승인이나 성공 증거가 아니다. 마일스톤별 실제 결과와 미실행
항목은 `docs/evidence/<milestone>.md`에서만 판정한다.

JS/TS만 변경하고 native dependency, config plugin, native app-config field가 바뀌지 않았다면
기존 Development Build와 Metro를 재사용한다.

```sh
bun run expo:start
```

Native-affecting 변경이 승인된 경우의 전체 순서는 다음과 같다. M5의
`react-native-keyboard-controller`처럼 native code를 포함한 dependency를 추가·변경했다면 기존
Development Build 재사용만으로 완료하지 않는다.

```sh
bun run expo:prebuild:clean
bun run android:avd:verify
bun run android:avd:start
bun run android:gradle:stop
bun run toolchain:check:native
bun run expo:run:ios
bun run expo:run:android
bun run expo:start
```

`expo:start`는 terminal을 점유하므로 종료할 때 `Ctrl-C`를 사용한다. `expo:run:*`가 앱을 자동으로
열어도 build/install 증거일 뿐이다. Metro에 연결한 뒤 iOS Simulator와 Android Emulator에서
현재 화면을 각각 직접 확인해야 runtime smoke가 완료된다. Keyboard 관련 변경은 composer와
latest message가 keyboard 진행률에 맞춰 함께 이동하는지, 전송 후 focus와 최신 committed
message가 유지되는지도 두 플랫폼에서 따로 관찰한다.

### 기기 검증 전 확인 단계 (F7/C20)

JS-only 변경을 기존 dev client로 확인하는 세션(재빌드 없이 Metro만 새로 올리는 경우)은, 요구
사항 §8 항목별 확인을 시작하기 전에 다음을 먼저 본다. 이 단계도 상태를 바꾸지 않는 읽기 전용
점검이며 재설치나 재빌드를 자동으로 수행하지 않는다.

1. Android: `android:avd:start` 뒤 5.1절의 절차로 되살아난 앱이 최신 설치인지 확인한다.
2. iOS: 시뮬레이터에 dev client가 설치돼 있는지 확인한다(quickboot 스냅샷이 없어 되살림 문제는
   없지만, 설치 자체가 지워졌는지는 따로 봐야 한다).
   ```sh
   xcrun simctl get_app_container <device udid> <bundle identifier>
   ```
3. `expo:start`로 Metro를 올린 뒤, 두 플랫폼 모두 현재 JS 번들이 적용됐는지(번들 module 수,
   로그인 유지 상태의 그룹 목록처럼 이미 아는 화면이 보이는지)를 §8 확인에 들어가기 전에 먼저
   본다.

2026-09-30 M17 라운드 1에서 이 절차로 두 플랫폼 모두 현재 JS로 번들됐고(Android 2516 modules,
iOS 2591 modules) 로그인 상태의 그룹 목록이 보이는 것을 preflight로 확인한 뒤 §8 항목별 확인에
들어갔다.

### Maestro E2E 실행 (M17 라운드 2)

E2E는 로그인된 dev client에서 로컬로 실행한다. 저장소에 CI가 없어 자동 실행은 없다. 도구는 devShell의
`maestro` 2.8.0이다(`nix/toolchain-versions.nix`에 고정, `toolchain:check`가 exact 버전을 검사하고
devShell이 `MAESTRO_CLI_NO_ANALYTICS=1`을 설정한다). flow는 `e2e/maestro/dev-client-journeys.yaml`
하나이며 일곱 여정(시작에서 그룹 목록까지, 테스트 그룹 홈, 그룹 대화방에서 텍스트 메시지 1건 전송, 주제
상세와 뒤로가기 순서, 그룹 정보와 갤러리, 알림함, 계정 탭 읽기)이 앞 여정이 남긴 화면에 이어지므로
여정별 파일로 나누지 않았다. 그룹·대화는 deep link로 열 수 없어 모든 이동을 UI로 한다.

전제 조건은 다음과 같다.

1. iOS 시뮬레이터나 Android 에뮬레이터에 dev client가 설치돼 있고, 사용자가 한 번 직접 로그인한
   상태다. flow는 자격 증명을 입력하지 않는다. 로그인이 안 돼 있으면 여정 1의 그룹 목록 대기(최대
   60초)가 시간 초과로 실패한다.
2. Metro가 실행 중이다(`bun run expo:start`). Android는 `adb reverse tcp:8081 tcp:8081`을 해 두면
   두 플랫폼이 같은 `localhost` origin을 쓴다.
3. dev menu의 "Tools button"(떠 있는 톱니 버튼)을 끈다. 켜져 있으면 오른쪽 가장자리의 행을 누를 때
   dev menu가 열린다. 개발자 설정이며 다시 켤 수 있다.
4. 계정이 테스트 그룹 하나의 구성원이고 그 그룹에 기존 주제가 있다. 실행마다 그 그룹 대화방에
   운영 서버 쓰기(텍스트 메시지 1건)가 남는다. 주제 생성·삭제와 그룹 관리는 flow에 없다.

값은 실행할 때만 셸에서 넘기고 저장소·문서·증거에 쓰지 않는다.

```sh
export MAESTRO_METRO_URL=http%3A%2F%2Flocalhost%3A8081 \
  MAESTRO_TEST_GROUP_NAME='<테스트 그룹 이름>' \
  MAESTRO_TEST_TOPIC_TITLE='<그 그룹의 기존 주제 제목>' \
  MAESTRO_E2E_MESSAGE='<보낼 메시지 본문>'
bun run e2e:ios        # 또는 bun run e2e:android
```

- `MAESTRO_METRO_URL`은 flow가 `openLink`의 query에 그대로 넣으므로 URL 인코딩한 origin이어야 한다.
- Maestro 2.8.0은 셸의 `MAESTRO_*` 변수를 flow에 자동 주입하지 않는다. package script가 각 값을 `-e`로
  넘기므로 셸에서 export만 하고 `-- -e`는 덧붙이지 않는다. 특정 기기를 고르려면 `MAESTRO_DEVICE`도
  export한다.
- 결과와 화면은 ignored `.maestro-output/`에 남는다.

flow 설계에서 Maestro 2.8.0 동작을 확인해 반영한 내용은 다음과 같다.

- 시작 때 `stopApp`을 먼저 한다. 장시간 실행된 dev 프로세스가 dev-client 링크를 받은 뒤 크래시한 관찰
  때문에 링크가 항상 cold start가 되게 했다(위 ANR 절).
- 그룹 목록을 최대 60초 기다린다. 에뮬레이터의 세션 복원은 6-60초이고 3초 안전 시간 뒤 로그인 화면이
  잠깐 보일 수 있어 "지금 로그인 화면인가"를 순간 검사하면 안 된다. Android cold start는 파일 변경
  직후 JS 시작까지 수십 초(약 37초 관찰) 걸릴 수 있다.
- `back`은 Android 전용이다. iOS는 `tapOn id: BackButton`으로 뒤로 간다. iOS에서 `back`은 아무 동작도
  하지 않아 이어지는 제목 단언이 거짓 통과한다.
- `hideKeyboard`는 iOS에서만 부른다. Android의 `hideKeyboard`는 조건 없이 BACK 키(`input keyevent 4`)를
  보내 키보드가 이미 내려가 있으면 화면을 떠난다.
- 주제 링크를 찾는 `scrollUntilVisible`에 `centerElement: true`를 둔다. 키보드가 올라온 상태에서 링크가
  반투명 내비게이션 바 아래에 걸린 채 멈추면 탭이 header 제목(그룹 정보)으로 간다.
- 전송한 메시지 본문에 `evalScript`로 `Date.now()` 접미사를 붙인다. 두 플랫폼이 같은 환경 값을
  공유해도 각자 보낸 메시지만 확인하게 하려는 것이다. iOS 메시지 행의 접근성 이름이 "본문, 전송됨"이라
  본문 접두 일치로 찾는다.
- flow를 디버깅할 때는 전송 단계를 뺀 임시 사본(저장소 밖)으로 실행해 운영 쓰기를 늘리지 않는다.

결과(2026-10-02): 최종 required 실행에서 Android가 일곱 여정을 통과했고(1분 6초), iOS도 통과했다(48초).
앞선 실패는 flow 판정 단계 오류(접근성 이름 일치, 탭 타이밍, 키보드)와 환경 문제(Android driver 지연,
iOS dev client 로그아웃)였고, 모두 flow나 전제 조건 보강으로 처리했다. 운영 쓰기는 테스트 그룹의 텍스트
메시지 iOS 4건·Android 1건으로 사용자가 허용한 한도 안이다.

OMA 작업 원장에서 이 task는 `failed`로 남았다. 고정 required check ID(`maestro-run-ios`,
`maestro-run-android`)에는 1·2차 실패 기록만 있고, 통과한 실행은 같은 명령을 ID 없는 ad-hoc check로
돌렸기 때문이다. 사용자 결정(A16)으로 이 상태를 그대로 두고 추가 운영 쓰기로 고정 ID 기록을 다시 만들지
않았다. 판정 근거는 위의 통과 실행이다.

### 실기기·시뮬레이터 개발 메모 (M17 라운드 2)

- devShell에 UTF-8 locale이 없으면 `expo prebuild`와 `pod install`이 CocoaPods(Ruby)의 encoding 오류로
  멈춘다. 네이티브 설정이 바뀌어 prebuild를 다시 할 때는 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`을 함께
  준다(예: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bunx expo prebuild -p ios`).
- 물리 iPhone dev client는 Mac의 `localhost`에 닿지 못하므로 Mac의 LAN 주소로 Metro에 연결한다.
  - iPhone을 개발자 모드로 두고 케이블로 연결해 잠금을 해제하고 "이 컴퓨터를 신뢰"를 허용한다.
    `xcrun devicectl list devices`로 식별자를 확인하고 `bun run expo:run:ios --device <Identifier>`로
    빌드·설치한다(Xcode 자동 서명, Sign In with Apple·Associated Domains capability 필요).
  - Mac과 iPhone을 같은 Wi-Fi에 두고 `ipconfig getifaddr en0`으로 Mac 주소를 확인한다. 앱이 묻는
    "로컬 네트워크" 권한을 허용하고, dev launcher에서 `http://<Mac 주소>:8081`을 직접 입력하거나
    `exp+jamye-app://expo-development-client/?url=http%3A%2F%2F<Mac 주소>%3A8081` 링크를 연다.
- 기기에서 앱이 시작하자마자 종료되면 Metro나 네트워크를 의심하기 전에 기기 crash log부터 본다. F-8은
  처음에 Metro 문제로 오진했다가 crash log로 원인을 찾았다.

  ```sh
  xcrun devicectl device info files --domain-type systemCrashLogs --device <Identifier>
  ```

  목록에서 고른 파일은 `xcrun devicectl device copy from`으로 Mac에 복사한다(옵션은 `--help`를 따른다).

- 앱 데이터 컨테이너도 같은 방식으로 읽을 수 있다(`--domain-type appDataContainer
--domain-identifier dev.local.jamyeapp`). F-9 때 기기가 만든 녹음 파일을 꺼내 `afinfo`로 분석했다.
- Android 에뮬레이터의 TalkBack 제스처는 자동화로 보낼 수 없다. `adb shell input`은 TalkBack을
  우회하고, 키보드 단축키나 원시 터치 이벤트는 제스처로 인식되지 않았다. 접근성 노드 트리
  (`uiautomator dump`)로 순서와 라벨만 확인하고 제스처 이동은 수동으로 확인한다. 200% 글자 크기는
  `font_scale 2.0`으로 만든다.
- iOS 시뮬레이터의 큰 글자는 Dynamic Type `accessibility-large`(React Native 배율 약 2.14)와
  `accessibility-extra-extra-extra-large`(약 3.57)로 확인하고 끝나면 `large`로 되돌린다. 프레임 분석
  도구(ffmpeg)가 없어 reduce motion의 시각 확인은 실기기에서 한다.
- Android smoke 중 뒤로 가기를 너무 많이 누르면 앱을 벗어나 런처를 거쳐 다른 시스템 화면이 열릴 수
  있다. 화면 밖으로 나가면 입력 없이 돌아와 dev-client 링크로 앱을 다시 연 뒤 이동한다.

### 6.1 Production release / rollback preflight — future gate

아래 checklist는 M5 실행 증거가 아니라 향후 production release 승인을 위한 필수 template다.
각 항목의 owner, 실행 시각, 결과와 복구 근거가 채워지기 전에는 production 배포를 승인하지
않는다.

- [ ] Dependency 변경을 별도 승인하고 `bun audit`의 미수용 Critical/High finding이 없음을 기록한다.
- [ ] Production signing과 runtime secret을 source control 밖에 준비하고, `EXPO_PUBLIC_*`에
      secret이 들어가지 않았음을 검사한다.
- [ ] 암호화된 SQLite backup/restore의 owner와 보관 위치를 정하고 실제 restore 성공 증거를 남긴다.
- [ ] Migration version, forward compatibility, rollback/downgrade 결정을 기록하고 전후
      `integrity_check`, foreign-key violation, row count와 canonical fingerprint를 비교한다.
- [ ] Rollback trigger와 실행 owner를 지정하고, 별도 승인된 migration 계획이 없으면 사용자
      SQLite와 queued outbox를 보존한다.
- [ ] Rollback 뒤 package/lock hash, native autolinking, 양 플랫폼 app launch, data integrity,
      monitoring/error reporting과 release health를 확인한다.

M5에서는 이 production checklist를 실행하지 않았다. M5의 local rollback 경계와 미실행
항목은 `docs/evidence/M5.md`에 기록한다.

## 7. 표준 검사 순서

일상적인 code-only 변경은 다음 하나로 검사한다.

```sh
bun run check:code
```

Dependency와 native 상태를 바꾸지 않는 전체 repository 검사는 다음 명령이다.

```sh
bun run check
```

`bun run check`는 `check:code` → `check:expo` → `check:toolchain` 순서다. AVD create/reconcile,
strict native preflight, prebuild, build, Metro와 device smoke는 자동으로 실행하지 않는다. 이들은
상태와 플랫폼 선행 조건이 있으므로 해당 변경의 별도 승인 카드에서 수행한다.

검사 결과를 기록할 때는 실제 command, exit code, 핵심 summary와 미실행 항목을 분리한다.
문서에 명령이 적혀 있거나 과거 한 번 성공했다는 사실을 현재 실행의 PASS로 재사용하지 않는다.
