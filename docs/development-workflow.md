# 개발 명령과 검증 절차

이 문서는 `jamye-app` 개발자가 사용하는 명령의 단일 운영 가이드다. 도구와 버전의 선언
원본, 각 `package.json` script의 책임, 상태 변경 여부와 표준 실행 순서를 함께 기록한다.
README는 빠른 시작만 제공하고 세부 절차는 이 문서를 참조한다.

## 1. 명령 권위와 환경 진입

Nix가 Bun을 공급하므로 저장소 바깥의 전역 Bun이 아니라 다음 순서로 시작한다.

```sh
nix flake check path:.
nix develop path:.
```

`nix develop path:.`은 Bun script보다 앞선 bootstrap 명령이라 `package.json` alias를 두지
않는다. devShell에 들어온 뒤에는 직접 `bunx`나 도구 binary를 조합하지 않고 이 문서의
`bun run <script>` 진입점을 사용한다.

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

| 영역                  | 현재 승인 버전       | 권위 원본                                                   |
| --------------------- | -------------------- | ----------------------------------------------------------- |
| Bun                   | 1.3.13               | `nix/toolchain-versions.nix`, `package.json#packageManager` |
| Node.js               | 22.23.2              | `nix/toolchain-versions.nix`                                |
| JDK                   | 17.0.19              | `nix/toolchain-versions.nix`                                |
| CocoaPods             | 1.16.2               | `nix/toolchain-versions.nix`                                |
| Expo                  | 57.0.21              | `package.json`, `bun.lock`                                  |
| Expo Router           | 57.0.20              | `package.json`, `bun.lock`                                  |
| Expo Dev Client       | 57.0.18              | `package.json`, `bun.lock`                                  |
| React Native          | 0.86.3               | `package.json`, `bun.lock`                                  |
| Keyboard Controller   | 1.21.9               | `package.json`, `bun.lock`                                  |
| TypeScript            | 6.0.3                | `package.json`, `bun.lock`                                  |
| ESLint                | 9.39.5               | `package.json`, `bun.lock`                                  |
| Prettier              | 3.9.6                | `package.json`, `bun.lock`                                  |
| Jest                  | 29.7.0               | `package.json`, `bun.lock`                                  |
| Android Platform      | 36                   | `nix/toolchain-versions.nix`                                |
| Android Build Tools   | 36.0.0, 35.0.0       | `nix/toolchain-versions.nix`                                |
| Android CMake         | 3.22.1               | `nix/toolchain-versions.nix`                                |
| Android NDK           | 27.1.12297006        | `nix/toolchain-versions.nix`                                |
| Android Emulator      | 37.1.11.0            | `nix/android-avd-spec.json`                                 |
| Android system image  | API 36.1, revision 4 | `nix/android-avd-spec.json`                                 |
| Gradle wrapper        | 9.3.1                | React Native/Expo가 생성한 `android/gradle/wrapper`         |
| Android Gradle Plugin | 8.12.0               | React Native Gradle plugin dependency                       |
| Xcode와 iOS runtime   | host 설치를 사용     | `toolchain:check`가 선택 경로와 실제 상태 검증              |

Nix 또는 package dependency를 바꾸면 이 표를 수동으로 먼저 믿지 않는다. 선언 원본을 변경한
뒤 아래 toolchain, Expo, quality 검사를 통과시키고 문서 표를 함께 갱신한다.

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
nix develop . --command node tools/contracts/intake-server-contract.mjs
nix develop . --command node tools/contracts/generate-server-contract.mjs

# 현재 checked-in snapshot/generated output의 read-only drift check
nix develop . --command node tools/contracts/check-server-contract.mjs
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
| `CI=1 bun run expo:run:ios --device 95B8CDCD-0C27-4B40-A48F-71AC2B0FD547`                   | exit 0; iPhone 17 / iOS 26.5 빌드·설치·실행, 0 errors / 1 warning    |
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

| 실행 범위                                      | 결과                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| task1 contract/auth                            | 6 suites / 92 tests                                                |
| M6 관련 회귀                                   | 10 suites / 62 tests                                               |
| architecture fixture                           | 72 tests                                                           |
| auth cancellation follow-up                    | 2 suites / 41 tests                                                |
| task2 API/state/error                          | 3 suites / 65 tests                                                |
| groups provider + app provider                 | 2 suites / 18 tests                                                |
| management/store/connected-index               | 3 suites / 27 tests                                                |
| groups home/detail/connected-index             | 3 suites / 24 tests                                                |
| TypeScript no-emit typecheck                   | exit 0                                                             |
| final aggregate `rtk proxy bun run check:code` | exit 0; 51 suites / 551 tests                                      |
| final global coverage                          | statements 90.16%, branches 83.40%, functions 92.62%, lines 92.49% |
| contract checker                               | `status:ok`, exit 0                                                |
| transport/architecture regression              | 2 suites / 75 tests passed                                         |

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

그다음 현재 devShell에서 `exit`하고 repository root에서 `nix develop path:.`로 새 session에
진입한다. Boot된 project Emulator는 그대로 둔 채 새 devShell에서 strict 검사를 재시도한다.

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

## 6. Expo Development Build script

| 명령                          | 분류        | 동작                                              |
| ----------------------------- | ----------- | ------------------------------------------------- |
| `bun run expo:install:check`  | 읽기 전용   | 비대화형 Expo dependency 호환성 검사              |
| `bun run expo:doctor`         | 읽기 전용   | 로컬 고정 `expo-doctor` 실행                      |
| `bun run check:expo`          | 복합 검사   | dependency check → doctor                         |
| `bun run expo:start`          | 장시간 실행 | Development Client용 Metro 시작                   |
| `bun run expo:prebuild:clean` | 파괴적 생성 | ignored `ios/`, `android/` 삭제·재생성            |
| `bun run expo:run:ios`        | build       | Simulator binary build/install/open, Metro 미포함 |
| `bun run expo:run:android`    | build       | Emulator APK build/install/open, Metro 미포함     |

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
