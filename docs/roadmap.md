# jamye-app 그린필드 로드맵

- 상태: 확정됨 — M2 완료 승인; local commit과 M3 시작은 별도 게이트
- 로드맵 기준 세션: `20260822-200158`
- 현재 M2 세션: `20260824-183223`
- 결정권자: 사용자
- 실행 조정자: 주 에이전트
- 대상: iOS·Android React Native 앱의 첫 offline-first 채팅 수직 절편
- 최종 수정일: 2026-08-25

## 1. 이 문서의 역할

이 문서는 완성 일정을 약속하는 달력이 아니라, 다음 질문에 계속 답할 수 있게 하는 실행 지도다.

1. 지금 무엇을 만들고 있는가?
2. 왜 이 단계가 먼저인가?
3. 에이전트가 무엇을 할 수 있는가?
4. 사용자가 직접 결정하거나 실행해야 하는 것은 무엇인가?
5. 어떤 증거가 있어야 다음 단계로 넘어가는가?

각 마일스톤은 독립된 승인 게이트다. 에이전트는 현재 승인된 마일스톤을 넘어서 구현하지 않는다.

### 1.1 이번 product scope

이번 로드맵은 잼얘좀 전체 기능을 만드는 계획이 아니다. **한 대화방의 offline-first 텍스트 채팅을 양 플랫폼에서 검증하는 것**만 구현한다.

포함:

- fixture 대화방을 SQLite에서 읽기
- 한국어 composer에서 optimistic message와 outbox를 atomic하게 생성
- offline 전송 의도를 앱 재시작 뒤에도 보존
- network 복귀 후 REST canonical event로 한 번만 수렴
- WebSocket event 유실을 delta sync로 복구
- chat list virtualization·prepend anchor·IME·safe area·접근성
- iOS·Android Development Build와 chat E2E

제외하고 backlog로 이동:

- 완성형 카카오·구글·애플 OAuth와 계정 lifecycle
- group 생성·초대·owner/member 관리
- topic timeline과 seed → enriched 흐름
- 사진·영상·음성·STT와 on-device AI
- 인앱 알림·push skeleton·production remote push
- 그 밖의 모든 비채팅 제품 기능

현재 chat transport는 **인증 없는 로컬 deterministic fixture transport**만 사용하며, 이를 production server 연결이나 로그인으로 표시하지 않는다.

## 2. 협업 원칙

### 2.1 역할

| 역할               | 책임                                                         |
| ------------------ | ------------------------------------------------------------ |
| 사용자             | 제품·아키텍처 결정, 중요 명령 실행, 결과 확인, 마일스톤 승인 |
| 주 에이전트        | 선택지와 권고안 설명, 작업 분배, 파일 변경 통합, 결과 해석   |
| 구현 에이전트      | 승인된 범위 안의 코드·테스트·문서 작성                       |
| 독립 리뷰 에이전트 | 계획·구현을 새 맥락에서 읽고 누락·위험·과설계를 검토         |

### 2.2 에이전트가 자율적으로 할 수 있는 일

- 저장소와 참고 자료의 읽기 전용 조사
- 승인된 마일스톤 범위 안에서 파일 초안 작성과 국소 수정
- 테스트 케이스와 명령어 제안
- 안전한 읽기 전용 명령 실행: `git status`, `git diff`, `rg`, JSON 구문 확인 등
- 독립 리뷰 에이전트 호출과 리뷰 결과 정리
- 결과와 실패 원인의 설명

### 2.3 사용자가 직접 실행하는 중요 명령

아래 명령은 사용자가 해당 명령을 개별적으로 위임하지 않는 한 에이전트가 대신 실행하지 않는다.

- Xcode, Android Studio, SDK, emulator, simulator, 라이선스 설치·승인
- `nix flake lock`과 flake input 갱신
- `bun install` 및 lockfile을 변경하는 dependency 명령
- `create-expo-app` scaffold 생성
- `expo prebuild --clean`처럼 생성 디렉터리를 지우고 다시 만드는 명령
- native dependency 또는 config 변경 뒤 development client 재빌드
- `nix build`, Gradle, Xcode native build
- simulator·emulator·실제 기기에 앱을 설치하거나 실행하는 명령
- migration을 실제 데이터에 적용하는 명령
- EAS 로그인·프로젝트 생성·credential 생성
- production signing, App Store Connect·Play Console 제출
- Git commit, branch publication, push, PR, merge, history 변경
- 외부 서비스나 homelab 상태를 변경하는 모든 명령

### 2.4 사용자가 직접 내리는 중요 결정

- 마일스톤 시작·완료 승인
- SDK 또는 주요 dependency 추가·교체
- production bundle ID와 Android package name
- 인증·push·deep-link 공개 계약
- bootstrap contract 승인과 실제 server contract 전환
- SQLite migration 및 데이터 삭제 정책
- 범위·일정·완료 조건 변경
- production signing과 store release 여부

함수 이름이나 작은 테스트 fixture 구조처럼 쉽게 되돌릴 수 있는 구현 세부사항은 승인된 구조 안에서 에이전트가 결정할 수 있다. 그 결정이 공개 계약, 데이터, native 설정 또는 새로운 dependency에 영향을 주면 중요 결정으로 승격한다.

## 3. 명령 실행 프로토콜

중요 명령을 실행할 때 주 에이전트는 먼저 다음 형식의 명령 카드를 제공한다.

```text
목적:
왜 지금 필요한가:
실행 위치:
명령:
예상 변경:
예상 출력:
위험과 되돌리는 방법:
실행 후 확인할 항목:
```

진행 순서는 항상 같다.

1. 에이전트가 명령 카드와 선택지를 설명한다.
2. 사용자가 결정하고 명령을 직접 실행한다.
3. 사용자가 출력 또는 핵심 결과를 공유한다.
4. 에이전트가 결과를 해석하고 다음 변경을 제안한다.
5. 사용자가 마일스톤 통과 여부를 결정한다.

명령을 실행하지 않아도 진행 가능한 문서화·코드 초안 작업은 계속할 수 있지만, 해당 명령이 완료 조건이면 마일스톤은 통과시키지 않는다.

## 4. 확정된 기술·운영 경계

### 4.1 확정

- 이번 로드맵의 제품 기능 범위는 **채팅 domain과 offline/realtime 복구에 한정**
- React Native + TypeScript strict mode
- 실행 시점의 공식 문서에서 확인하고 사용자가 승인한 Expo stable SDK와 대응 React Native version
- Expo Development Build와 `expo-dev-client`
- Expo Router typed routes와 CNG
- Bun을 유일한 JavaScript package manager로 사용
- Nix flake의 `devShell`을 개발 환경의 진입점으로 사용
- Xcode와 Android Studio GUI는 사용자가 시스템에 설치
- 첫 수직 절편은 Nix devShell 안에서 native CLI build를 검증하고, debug·unsigned 산출물의 `nix build` 패키징은 별도 후속 트랙으로 진행
- production signing과 store 제출은 사용자가 직접 수행
- SQLite가 메시지·대화·cursor·outbox의 화면 source of truth
- TanStack Query는 이후 request/response state에 사용하되 채팅 메시지 원본과 경쟁시키지 않고, Zustand는 현재 slice에 필요한 작은 UI state만 담당
- 인증 없는 로컬 deterministic fixture transport로 채팅을 검증하며 production server 연결이나 인증을 표현하지 않음
- bootstrap contract는 실제 server release가 아님을 명시
- 기존 PWA, `jamye-server`, homelab, store console은 이 저장소 작업에서 변경하지 않음

M1 toolchain baseline은 2026-08-23 사용자 승인으로 확정됐다. Expo SDK 57,
React Native 0.86.2, React 19.2.3, Bun 1.3.13, Node.js 22.23.2 LTS,
Azul Zulu OpenJDK 17.0.19, CocoaPods 1.16.2, Android command-line tools 21.0,
platform-tools 37.0.1, Platform 36, Build Tools 36.0.0을 사용한다. NDK는 포함하지 않는다.
단일 `nixpkgs-unstable` 입력을 사용하며, 사용자 생성 `flake.lock`이 고정한
`391b592eb44808b3bd0cb80bb71b63a5a118b8bb`을 정확한 Nix snapshot으로 사용한다. 공식
근거와 lock 검증 기록은 `docs/research/mobile-baseline.md`를 SSOT로 사용한다.

M3 종료 전 Expo compatibility refresh에서는 SDK 57 line을 유지하면서 현재 application
dependency를 Expo 57.0.17과 React Native 0.86.3으로 갱신했다. M1의 당시 조사값은 위 기록과
research 문서에 보존하고, 현재 exact package 선언과 resolution은 `package.json`과
`bun.lock`을 권위 원본으로 사용한다.

### 4.2 보류

- production bundle ID와 Android package name
- universal link와 app link domain
- 실제 `jamye-server` contract tag·commit
- production OAuth credential
- production push credential과 provider 운영 설정
- App Store·Play Store release 절차

### 4.3 구현하지 않지만 잃지 않을 release gate와 backlog

첫 수직 절편에서 아래 기능을 구현하지는 않는다. 다만 나중에 release를 준비할 때 빠뜨리지 않도록 명시적 게이트로 유지한다.

Release gate:

- 새 client release 전에 `jamye-server`가 current/previous contract version을 지원하는지 확인
- iOS store 제출 전에 Sign in with Apple을 제공하거나 App Review Guideline 4.8 예외 근거를 확인
- 앱에서 계정을 만들 수 있게 되는 release 전에는 앱 안에서 계정 삭제를 시작하는 경로를 제공
- production identifier, universal/app link, OAuth, push credential, privacy copy, signing을 사용자가 별도로 승인

이후 product backlog:

- 초대 기반 group과 owner/member 관리
- 날짜별 topic timeline, seed → enriched 흐름, group main room과 topic room
- 사진·동영상은 system picker를 우선하고, 음성은 해당 시점의 Expo 권장 audio package를 사용하는 첨부·재생·STT와 기능 사용 시점 permission
- on-device AI
- 인앱 알림과 push adapter skeleton, 권한·installation lifecycle·deep link, production remote push, push privacy preference
- **완성형 카카오·구글·애플 OAuth 로그인**: provider UI/SDK·API, system-browser PKCE 또는 mobile exchange, callback allowlist, SecureStore token lifecycle, refresh single-flight, logout·stale credential 정리
- 계정 생성·관리·삭제
- 기존 PWA 제거 또는 web target 대체 여부의 별도 제품 결정
- 전체 design polish와 animation
- Expo로 충족할 수 없을 때만 `modules/` local Expo Module을 검토하고, CNG로 표현 불가능한 native 변경은 ADR 후 source-controlled native project 전환

## 5. 전체 흐름

```text
M0 감독형 작업 방식 승인
  ↓
M1 공식 baseline 확인 + Nix devShell
  ↓
M2 Expo/Bun scaffold
  ↓
M3 앱 기반 구조와 품질 경계
  ↓
M4 bootstrap contract + SQLite
  ↓
M5 로컬 채팅 읽기·쓰기
  ↓
M6 offline outbox + realtime/delta 복구
  ↓
M7 E2E + native Development Build
  ↓
M8 문서·실기기 확인·첫 수직 절편 종료
```

## 6. 마일스톤

### M0. 감독형 작업 방식과 계획 확정

목표는 에이전트의 작업 범위, 사용자 결정권, 명령 실행 절차를 먼저 고정하는 것이다.

에이전트 작업:

- 이 로드맵과 machine-readable plan 작성
- 완전성·메타·단순성 독립 리뷰
- 리뷰 결과와 남은 결정 정리

사용자 게이트:

- 로드맵 승인
- 중요 명령과 결정의 사용자 소유권 승인
- Ultrawork `PLAN_GATE` 상태 명령 직접 실행

완료 증거:

- Git에 남길 durable 계획인 `docs/roadmap.md`
- 현재 `.gitignore` 아래의 OMA session artifact인 `docs/plans/work/001-jamye-app-greenfield.md`와 `.agents/results/plan-20260822-200158.json`
- 세 개의 독립 리뷰가 PASS이거나 지적이 반영됨
- 사용자의 명시적 승인

### M1. 공식 mobile baseline과 Nix 전용 개발 환경

목표는 현재 stable 조합을 근거로 정한 뒤, 개발자마다 다른 전역 도구 대신 `nix develop`로 동일한 CLI 환경에 진입하는 것이다.

에이전트 작업:

- 현재 디렉터리·Git·기존 package-manager/lockfile·Xcode·Android SDK 상태를 읽기 전용으로 확인하고 `docs/research/workspace-baseline.md`에 기록
- Expo release archive, SDK별 React Native 표, Bun 사용법, EAS/Expo CLI 요구사항을 공식 자료에서 읽기 전용 확인
- 출처 URL·확인일·stable 판정·후보 version·호환 조건을 `docs/research/mobile-baseline.md`에 기록
- 기존 `jamye-plz`의 지정 문서·route·chat component·API·test를 읽고 **이번 채팅 slice에 필요한** 제품 동작, 한국어 카피, design token, 회귀 의도만 `docs/product-intent.md`에 추출; 비채팅 내용은 backlog link만 남김
- Svelte component, Tailwind/daisyUI class, CSS rule을 복사하지 않았음을 product-intent review에서 확인
- `flake.nix` 구조 제안
- `nix/dev-shell.nix`, `nix/android-sdk.nix` 작성
- 사용자가 승인한 Bun, Node, JDK, Android CLI toolchain과 CocoaPods를 고정
- NDK·Watchman·Maestro는 scaffold 또는 해당 검증 단계가 필요성을 증명한 뒤 별도 승인으로 추가
- `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `DEVELOPER_DIR` 등 비밀이 아닌 환경 변수 정의; NDK를 포함하지 않으므로 `ANDROID_NDK_ROOT`는 설정하지 않음
- 외부 Xcode·Android Studio 상태를 읽기만 하는 진단 script 작성

사용자 직접 실행:

- 공식 근거를 바탕으로 version 조합 승인 — 2026-08-23 완료
- Android SDK license를 Nix 구성의 `android_sdk.accept_license = true`로 declarative하게 수락 — 2026-08-23 완료; read-only Nix SDK에 쓰는 `sdkmanager --licenses` 명령은 사용하지 않음
- 아직 커밋되지 않은 새 Nix 파일도 포함하도록 `nix flake lock path:.`로 flake input 고정 — 2026-08-23 완료
- 같은 이유로 `nix develop path:.`로 devShell 진입 — 2026-08-23 완료
- Xcode·Android Studio·simulator·emulator 설치 — 2026-08-24 완료
- 각 tool version 확인 명령 — 최종 진단의 exact-version 검사로 2026-08-24 완료
- devShell 안에서 `./tools/diagnostics/toolchain-check.sh` 실행 — `23 passed, 0 failed`
- repository root에서 `nix flake check path:.` 실행 — `flake_check_exit=0`

결정 게이트:

- `aarch64-darwin` 단일 지원으로 시작
- Nix SDK를 CLI build의 authoritative SDK로 사용
- Android SDK license acceptance는 사용자 결정으로 승인하고 flake에 declarative하게 기록
- NDK는 M1에서 제외하며 `ANDROID_NDK_ROOT`를 설정하지 않음
- 비밀값이나 signing material을 devShell에 넣지 않음

완료 증거:

- 깨끗한 shell에서 요구 도구의 version과 경로 확인
- declarative license acceptance가 적용된 composed Android SDK가 성공적으로 realize됨
- `nix flake check path:.`가 host GUI 상태와 독립적으로 flake output을 검증하며 통과
- devShell 안에서 별도로 실행한 read-only 진단이 Xcode 또는 Android Studio가 없거나 잘못된 경우 이해 가능한 메시지로 실패
- 공식 출처·확인일·승인된 version이 flake 및 이후 scaffold와 일치
- product-intent 문서가 지정 참고자료 전부와 각 산출 의도를 추적하고 source code 복사를 포함하지 않음
- scaffold 전 workspace baseline이 현재 Git·lockfile·toolchain 상태와 일치

### M2. 명시적 stable Expo SDK와 Bun scaffold

목표는 기존 OMA 파일을 보존하면서 M1에서 승인한 stable SDK template을 현재 저장소에 안착시키는 것이다.

에이전트 작업:

- non-empty 저장소 충돌 목록 작성
- 임시 디렉터리 scaffold 명령 카드 작성
- 생성된 template과 현재 저장소를 비교하고 필요한 파일만 통합
- `packageManager`와 Bun-only lockfile 정책 적용
- 기존 `.agents`, `.claude`, `.codex`, `AGENTS.md` 보존

사용자 직접 실행:

- 임시 위치의 `create-expo-app` 명령
- 최초 `bun install`
- 생성 diff 확인

결정 게이트:

- 실제 template의 route 위치를 존중할지 확인
- Expo SDK·React Native·Bun 정확한 버전 승인

완료 증거:

- `package-lock.json`, Yarn·pnpm lockfile이 없음
- `bun.lock`과 `packageManager` 일치
- Expo doctor와 TypeScript 기본 검사 통과
- 사용자가 Expo Go를 iOS Simulator와 ADB Android target에서 실행해 default template을 확인;
  Development Build 또는 native build 증거와 구분
- template 선택과 package manager 근거가 ADR에 기록됨
- M2가 새로 작성한 비-template 실행 application/domain 로직이 없는 bootstrap에만 적용되는
  품질 증거 유예와 M3 강제 이관 조건이
  ADR 0003에 기록됨; M2 lint와 coverage는 PASS가 아니라 미측정으로 유지

### M3. 앱 기반 구조와 품질 경계

목표는 기능을 얹기 전에 책임 경계와 실패 동작을 만든다.

에이전트 작업:

- Development Build, typed routes, CNG, app variants 설정
- thin route와 `core/features/shared` 경계; `store`는 실제 in-scope state owner가 생길 때만 추가
- environment validation, Error Boundary, redacted structured logger
- 인증·session·token interface가 없는 local fixture mode와 production server 연결이 아님을 보여 주는 명시적 개발 표시
- provider composition과 import boundary
- TypeScript strict와 SQLite chat-state 소유권 guard; TanStack Query·Zustand는 실제 소유 state가 생길 때만 추가
- 모든 screen/component가 HTTP client를 직접 import하지 못하게 하는 architecture check
- semantic design tokens와 dark mode 기반
- 실제로 작동하는 lint·format 설정과 M3 작성 실행 로직을 위한 의미 있는 test/coverage harness
- coverage denominator와 generated/template 제외 사유를 선언적으로 기록하고 빈 test suite,
  `passWithNoTests`, generated template 전용 test로 품질 조건을 우회하지 않는 guard
- README의 development client 재생성 조건
- `ios/`, `android/`를 CNG 생성물로 ignore하고 직접 수정·commit하지 않는 검증 script
- Expo Router 외 별도 navigation stack과 UI framework가 추가되지 않았음을 dependency/import check로 확인
- 현재 slice에는 preference state를 만들지 않고, 첫 실제 preference가 생길 때 저장소를 선택한다는 ADR 기록

사용자 직접 실행:

- simulator/emulator용 development identifier 승인
- native config 변경 후 development client build
- doctor, typecheck, lint, format 검사
- M3 test와 coverage 측정

완료 증거:

- route가 DB·HTTP·WebSocket을 직접 import하지 않음
- 환경의 비밀값과 message body가 로그 redaction test를 통과
- 잘못된 환경값이 시작 시 명확하게 실패
- lint가 실제 exit `0`으로 통과
- M3가 작성한 실행 가능한 application 로직을 포함한 aggregate coverage가 실제 측정값으로
  80% 이상이며 denominator와 제외 사유가 repository에 기록됨
- M2 품질 증거 유예가 M3 이후로 연장되지 않음
- tracked `ios/`, `android/` 파일이나 생성물 직접 수정이 없음
- 별도 navigation stack·UI framework dependency가 없음

### M4. Bootstrap contract와 SQLite 기반

목표는 로컬 데이터 원본과 wire contract를 구현 전에 차례로 고정하는 것이다. 원 프롬프트의 순서대로 첫 database schema·migration을 먼저 승인하고, 이어 bootstrap contract와 생성 type을 고정한다.

에이전트 작업 — database:

- deterministic migration과 `PRAGMA user_version`
- WAL, foreign key, bound query
- `conversations`, `messages`, `outbox_commands`, `applied_events`, `sync_cursors`
- repository와 DB change subscription

에이전트 작업 — contract:

- 현재 slice에 필요한 message command·conversation delta 두 REST endpoint와, REST·delta·WebSocket이 함께 쓰는 realtime message/cursor event schema만 정의하고 범용 contract platform으로 확장하지 않음
- bootstrap OpenAPI, realtime schema, fixtures, manifest
- `contract.lock`과 deterministic checksum
- REST·realtime TypeScript 생성 및 drift check
- `snake_case` DTO와 `camelCase` entity mapper
- bootstrap source와 교체 조건, `server_tag`·`server_commit`·`contract_version`·checksum provenance 기록
- optional field 호환, REST DTO 수동 이중 정의 금지, breaking version 정책 검증
- local CI entrypoint에서 generated diff 발생 시 실패

사용자 직접 결정·실행:

- bootstrap endpoint·event·cursor 계약 승인
- 첫 migration schema 승인
- contract generation과 실제 SQLite integration test 실행

완료 증거:

- 타입 재생성 후 diff 없음
- lock checksum 일치
- `contract.lock` provenance와 README의 production contract 교체 조건 일치
- optional field fixture는 허용되고 unknown event type은 crash 없이 기록 후 delta를 요청
- contract generation을 포함한 CI 명령이 diff를 남기면 실패
- migration 반복 실행 가능

### M5. 로컬 채팅 읽기·쓰기

목표는 test fixture 대화방을 SQLite에서 읽고, 한국어 입력을 안전하게 pending message로 저장하는 것이다.

에이전트 작업:

- SQLite 구독 기반 virtualized chat list
- prepend scroll anchor와 안정적인 key
- multiline composer와 명시적 전송 버튼
- composer send가 optimistic message와 outbox command를 하나의 exclusive SQLite transaction에서 생성
- failed message의 재시도 control은 기존 outbox command와 `client_msg_id`를 그대로 재사용
- pending·failed·sent의 비색상 상태 표시
- safe area, dynamic text, dark mode, accessibility label
- VoiceOver/TalkBack 읽기 순서, reduce motion, icon button hit target
- chat list·composer·button·keyboard 동작은 iOS HIG와 Android Material 관습에 맞추고, 실제 차이만 `.ios.tsx`, `.android.tsx` 또는 작은 adapter로 격리
- component·accessibility test

사용자 직접 결정·실행:

- 첫 단계에서 Enter는 줄바꿈, 버튼만 전송하는 IME 정책 승인
- iOS Simulator와 Android Emulator에서 화면 실행
- Korean IME와 keyboard 동작 직접 확인

완료 증거:

- 화면이 HTTP cache가 아닌 SQLite만 읽음
- 전송 즉시 pending message와 outbox가 함께 생성
- transaction 중 하나가 실패하면 optimistic message와 outbox가 모두 rollback
- 과거 행 prepend 후 보던 위치 유지
- VoiceOver·TalkBack용 label과 상태 텍스트 존재
- 확대 글자에서도 composer와 message state를 읽을 수 있고, 읽기 순서·hit target·reduce-motion·dark-mode 판정 항목이 준비됨
- iOS와 Android 양쪽에서 chat/composer control 동작을 비교한 증거와 platform-specific 파일·adapter 경계 review가 있음

### M6. Offline outbox와 realtime/delta 복구

목표는 오프라인 전송 의도를 앱 재시작 뒤에도 보존하고 canonical event 하나로 수렴시키는 것이다.

에이전트 작업:

- deterministic REST·WebSocket transport test double과 응답 유실·event 누락 fixture
- 인증 없는 local deterministic fixture transport만 사용하고 credential·session·token·OAuth interface가 생기지 않았음을 검증
- 단일 processor를 전제로 한 persistent outbox 상태 전이, restart 시 `in_flight` 복구, retry classifier, exponential backoff+jitter
- REST·WebSocket·delta가 공유하는 `applyEvent()`
- `event_id` dedupe와 monotonic cursor
- foreground, network regain, reconnect trigger의 single-flight 처리
- restart·duplicate·lost-event integration test
- `cursor 저장 → delta → 인증 없는 fixture WebSocket 연결 → second delta` 순서를 깨뜨린 race-window fixture와 정상 순서의 복구 test

사용자 직접 결정·실행:

- transient/permanent 오류 분류와 retry 상한 승인
- deterministic transport와 integration test 실행
- offline → 종료 → 재시작 → online 복구 시나리오 실행

완료 증거:

- HTTP 재요청은 가능하지만 canonical message는 하나
- 앱 재시작 뒤 같은 `client_msg_id` 재사용
- 사용자가 failed message를 다시 시도해도 새 command를 만들지 않고 기존 outbox command와 `client_msg_id`를 재사용
- realtime event 유실 뒤 delta가 복구
- unknown event가 crash하지 않고 delta를 요청

### M7. E2E와 native Development Build

목표는 자동화 결과와 실제 native build가 같은 수직 절편을 증명하게 하는 것이다.

에이전트 작업:

- Maestro flow와 실제 SQLite 진단 harness
- devShell 안에서 실행할 iOS·Android development build 명령 카드
- offline send·restart·recovery의 deterministic E2E fixture

사용자 직접 실행:

- `expo prebuild --clean` 명령
- Android·iOS development build
- simulator·emulator 실행과 Maestro flow

결정 게이트:

- production signing·keystore·provisioning은 계속 범위 밖

완료 증거:

- 두 플랫폼 development build smoke test 결과
- E2E에서 offline send와 recovery 확인
- 실패 시 정확한 toolchain·platform blocker 기록

### M8. 첫 수직 절편 종료

목표는 구현 사실과 미검증 사실을 분리해 다음 수직 절편으로 넘기는 것이다.

에이전트 작업:

- README, architecture, ADR, manual device checklist 완성
- 모든 필수 검사·build 명령을 `package.json` scripts와 README 명령표에 정확히 기록하고 각 명령을 실행·미실행 결과와 연결
- 전체 diff와 docs reference 검토
- 독립 QA·refactor·ship 리뷰
- 실제 실행 결과, 미실행 항목, 다음 slice 제안
- 최종 보고에 승인된 Expo SDK/RN/Bun과 공식 근거, 구조·상태 소유권, contract source·lock·checksum, 실제 test/build 결과, 플랫폼 차이·미검증 항목, 다음 slice·open decision, production/legacy 미변경 확인을 모두 포함

사용자 직접 실행·결정:

- 최종 검사 명령
- 실제 iPhone·Android 수동 checklist
- 수직 절편 완료 승인
- commit·push·PR 여부 별도 결정과 직접 실행

완료 증거:

- typecheck, lint, format, unit, component, integration, contract, E2E 결과
- 현재 환경에서 실행 가능한 필수 자동 검사는 사용자가 실제로 실행해 모두 통과했으며, 실행할 수 없는 native·device 항목만 정확한 blocker·명령 카드·재개 조건과 함께 남음
- domain mapper, event validation, component 상태, SQLite transaction, restart idempotency, delta recovery 등 채팅 요구 행위별 test가 통과
- iOS·Android 차이와 미검증 항목 문서화
- 실제 iPhone·Android checklist가 Korean IME, safe area, scroll anchor, VoiceOver/TalkBack label·읽기 순서, 확대 글자, icon hit target, reduce motion, dark mode를 항목별 `PASS | FAIL | BLOCKED`로 기록
- OAuth, group/topic, media/audio/STT, notification/push 등 비채팅 기능이 이번 결과에 포함되지 않았고 backlog로 유지됨을 확인
- local fixture transport가 production server 연결이나 로그인으로 표시되지 않고, session/token·SecureStore·OAuth provider·notification/push dependency가 current slice에 없음
- 기존 PWA·server·homelab·store 상태를 변경하지 않았다는 확인

### 후속 패키징 트랙 N1. Nix build 산출물

이 트랙은 첫 수직 절편 M8의 필수 관문이 아니다. 사용자가 별도로 시작을 승인하면 CLI로 만들 수 있는 범위의 산출물을 `nix build`로 재현한다.

- Android debug APK를 우선하고 unsigned release AAB는 실제 필요가 확인된 뒤 추가
- iOS Simulator `.app`은 host Xcode 의존성과 Nix sandbox 제약을 작은 spike로 검증한 뒤 derivation 또는 flake app 중 하나를 선택
- production signing, keystore, provisioning profile, store 제출은 계속 제외
- dependency closure, 네트워크 차단 build, SDK·contract·artifact checksum은 이 트랙의 완료 증거로 사용

## 7. 요구사항 추적

| ID          | 요구 영역                                                        | 주 마일스톤·작업 | 핵심 증거                                             |
| ----------- | ---------------------------------------------------------------- | ---------------- | ----------------------------------------------------- |
| R-ENV       | 공식 stable 조합, Bun, Nix devShell                              | M1               | 공식 출처·확인일, user-approved version, flake check  |
| R-INTENT    | 기존 PWA에서 제품·카피·token·회귀 의도만 추출                    | M1               | `docs/product-intent.md`, no-copy review              |
| R-CNG       | Development Build, Router, CNG, native 생성물 경계               | M2–M3            | doctor, dependency/import guard, tracked-native check |
| R-DATA      | SQLite migration·source of truth·atomic outbox                   | M4–M6            | migration·transaction·restart tests                   |
| R-CONTRACT  | lock provenance·generation·runtime validation·CI drift           | M4               | checksum, fixtures, local CI drift failure            |
| R-CHAT      | fixture 대화방, IME, anchor, 접근성                              | M5               | component tests와 양 플랫폼 수동 기록                 |
| R-SYNC      | retry, canonical apply, realtime gap recovery                    | M6               | offline/restart/dedupe/delta tests                    |
| R-NATIVE    | iOS·Android Development Build와 E2E                              | M7–M8            | 사용자 실행 출력과 checklist                          |
| R-BACKLOG   | OAuth, group/topic, media, notification/push 등 비채팅 기능 제외 | §4.3             | named backlog와 후속 scope 승인                       |
| R-NIX-BUILD | debug·unsigned CLI 산출물 패키징                                 | 후속 N1          | 별도 승인된 reproducible build evidence               |

## 8. 마일스톤 공통 완료 규칙

모든 마일스톤은 다음 조건을 만족해야 완료로 바꿀 수 있다.

- 승인된 범위 밖 파일을 변경하지 않았다.
- 새로운 dependency와 공개 계약 변경은 사용자 승인을 받았다.
- 에이전트가 변경 이유를 일반 언어로 설명했다.
- 사용자가 실행해야 할 명령과 예상 결과가 기록돼 있다.
- 실제 실행한 검사와 실행하지 못한 검사가 구분돼 있다.
- 실행 가능한 필수 자동 검사를 단순히 `미실행`으로 남긴 채 마일스톤을 완료하지 않는다.
- 실패·경고를 숨기거나 성공으로 바꾸지 않았다.
- production, legacy, remote 상태를 변경하지 않았다.
- 사용자가 해당 마일스톤 완료를 승인했다. 다음 마일스톤 시작은 별도 승인이다.

M2에는 사용자가 승인한 1회성 bootstrap 품질 증거 유예가 적용된다. 이는 M2가 새로 작성한
비-template 실행 가능한 application/domain 로직이 없다는 검증된 조건에만 성립하며 lint와 coverage를 PASS로
간주하지 않는다. 미측정 증거는 ADR 0003의 조건대로 바로 다음 M3에 강제 이관되고, M3 이후
다른 마일스톤에는 재사용하거나 자동 연장할 수 없다. 전역 Ultrawork 품질 기준은 변경되지
않는다.

중요 명령의 redacted 출력과 판정은 `docs/evidence/<milestone>.md`에 남긴다. 환경의 비밀값과 message body 등 민감값은 원문 그대로 기록하지 않는다.

## 9. 위험과 대응

| 위험                                      | 영향                       | 대응                                                         | 소유자                     |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------------ | -------------------------- |
| Xcode·Android toolchain 설치 지연         | native 검증 지연           | M1에서 조기 진단, 앱 로직 작업과 분리                        | 사용자                     |
| Nix Android dependency closure 누락       | 후속 N1 offline build 실패 | vertical slice와 분리하고 작은 debug APK derivation부터 검증 | 에이전트 제안, 사용자 승인 |
| iOS host Xcode의 비순수성                 | 후속 N1 재현성 제한        | spike 뒤 derivation 또는 flake app을 명시적으로 선택         | 공동 결정                  |
| bootstrap contract가 실제 서버처럼 굳어짐 | 통합 시 재작업             | `status=bootstrap`, production gate, 교체 조건 명시          | 사용자 승인                |
| SQLite와 Query cache 소유권 중복          | 데이터 불일치              | message import boundary와 architecture test                  | 에이전트                   |
| 에이전트가 범위를 앞서감                  | 이해·통제 상실             | 마일스톤 승인, scope allowlist, 독립 리뷰                    | 주 에이전트                |
| 사용자가 명령 목적을 모름                 | 검증이 형식화됨            | 모든 중요 명령에 명령 카드 제공                              | 주 에이전트                |

## 10. 에이전트 운영 방식

- 하나의 구현 작업은 한 에이전트가 명확한 파일 소유권을 가진다.
- 같은 우선순위의 독립 작업만 병렬화한다.
- 공유 contract와 migration은 downstream 작업 전에 승인한다.
- 리뷰 에이전트는 구현 에이전트의 설명을 보지 않고 durable artifact만 읽는다.
- 리뷰 결과가 CRITICAL 또는 HIGH이면 다음 마일스톤으로 가지 않는다.
- 사용자 승인을 대신 추론하지 않는다.
- 실제 명령 출력이 없으면 실행된 것으로 기록하지 않는다.

## 11. 결정 기록

| ID    | 결정                                                                                                                                                                       | 상태              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| D-001 | 별도 `jamye-app` 저장소에서 React Native + Expo Development Build 사용                                                                                                     | 승인됨            |
| D-002 | JavaScript package manager는 Bun 하나만 사용                                                                                                                               | 승인됨            |
| D-003 | Nix devShell을 개발 환경의 기본 진입점으로 사용                                                                                                                            | 승인됨            |
| D-004 | CLI debug·unsigned 산출물의 Nix 패키징은 M8 뒤 별도 N1 트랙에서 수행                                                                                                       | 계획 승인 대기    |
| D-005 | production signing과 store 제출은 사용자가 직접 수행                                                                                                                       | 승인됨            |
| D-006 | homelab과 모바일 앱 배포를 연결하지 않음                                                                                                                                   | 승인됨            |
| D-007 | SQLite가 채팅과 outbox의 유일한 화면 원본                                                                                                                                  | 승인됨            |
| D-008 | 실제 server artifact가 나오기 전 명시적 bootstrap contract 사용                                                                                                            | 승인 대기         |
| D-009 | production identifier와 link domain                                                                                                                                        | 보류              |
| D-010 | exact Expo/RN/Bun/JDK/Android version                                                                                                                                      | 2026-08-23 승인됨 |
| D-011 | 이번 product scope는 offline-first 채팅에 한정하고 완성형 OAuth와 모든 비채팅 기능은 backlog로 이동                                                                        | 승인됨            |
| D-012 | M2가 새로 작성한 비-template 실행 application/domain 로직이 없는 bootstrap의 lint·coverage를 미측정으로 유지하고 M3에 실제 lint·test·coverage 80% 조건을 한 번만 강제 이관 | 2026-08-25 승인됨 |

## 12. 현재 게이트

M2의 scaffold·Bun install·Expo doctor·TypeScript 검증과 독립 VERIFY·REFINE·SHIP 검토가
통과했다. 사용자는 Expo Go를 iOS Simulator와 ADB Android target에서 확인했고,
`G-M2-SHIP-REMEDIATION governance`로 ADR 0003의 M2 전용 품질 증거 유예와 M3 강제 이관을
승인했다. Governance scope, quality/eligibility, documentation/cascade의 세 fresh 독립 검토와
targeted remediation 재검토는 모두 PASS했고 CRITICAL/HIGH/MEDIUM/LOW finding이 0개다.
사용자는 2026-08-25에 `G-M2-FINAL approve_completion`으로 M2 완료를 승인했다.
M2 local commit과 M3 시작은 완료 결정에서 자동으로 파생되지 않는 별도 사용자 게이트이며,
Development Build와 native build는 아직 승인되거나 실행되지 않았다.
