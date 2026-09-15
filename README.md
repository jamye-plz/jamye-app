# jamye-app

잼얘좀의 iOS·Android 앱이다. React Native와 Expo를 사용하지만 기존 SvelteKit PWA를
기계적으로 옮기지 않는다. 첫 수직 절편은 한 대화방의 메시지를 SQLite에서 읽고 오프라인
전송 의도를 로컬에 보존했다. M9에서는 재시작 후 자동 전송 복구와 canonical event의
실시간·delta 동기화까지 연결했다.

현재 저장소에는 Expo SDK 57 Development Build/CNG 기반, M4의 local SQLite·bootstrap
contract, M5의 SQLite 기반 로컬 채팅 읽기·쓰기와 M6의 server contract intake,
shared session/account-safe connected-auth shell이 구현돼 있다. `local-fixture` mode는
보존된 fixture SQLite chat을, `connected-auth` mode는 shared OAuth session, U1 profile,
origin+UUID account namespace와 authenticated home을 표시한다. M7 connected-auth mode는
server-backed group navigation을 제공하고, M8은 실제 주제 목록·메시지 조회·전송·내 읽음 위치 저장,
M9는 영속 outbox와 실시간·누락 복구를 연결했다. M10 주제·태그는 전체 자동 검증·독립 리뷰와
양 플랫폼 사용자 수용 4/4 확인과 종료 승인을 받아 완료했다. 아래 명령은 실행 절차이며
그 자체로 현재 품질 검사, native build 또는 runtime 성공을 뜻하지 않는다. 실제 관찰 결과는
각 마일스톤 증거에 기록한다: [M3](docs/evidence/M3.md),
[M4](docs/evidence/M4.md), [M5](docs/evidence/M5.md),
[M6 네이티브·로그인 검증](docs/oauth-development.md), [M7 그룹·계정 전환 검증](docs/evidence/M7.md),
[M8 REST 채팅 검증](docs/evidence/M8.md), [M9 동기화 검증](docs/evidence/M9.md),
[M10 주제·태그 검증](docs/evidence/M10.md), [M11 미디어 구현·검증 현황](docs/evidence/M11.md).

## 현재 범위

M0-M5는 역사적으로 완료된 기반이다. M5는 **fixture 대화방 하나의 로컬 채팅 읽기·쓰기**까지
완료했고, 이후 Kakao/Google OAuth와 U1 profile이 추가 구현됐다. 현재 M6 빌드에서는
사용자가 iOS·Android 모두 Kakao·Google 실계정 로그인 성공을 확인했다. 추가 세션 검증과
iOS 취소·재로그인 사용자 확인을 마친 뒤 2026-09-09 M6를 정식 종료했다.
화면은 SQLite를
유일한 메시지 원본으로 읽고, 전송 시 pending message와 queued outbox command를 하나의
exclusive transaction에 기록한다. 실패 재시도는 기존 identity와 command를 재사용한다.
양 플랫폼 composer는 한국어 조합을 보존하며, native keyboard progress에 맞춰 최신 메시지와
입력창을 함께 이동하고 전송 뒤에도 keyboard focus를 유지한다.

M5의 queued outbox는 전송 의도를 로컬에 보존할 뿐 네트워크 전송 성공을 뜻하지 않는다.
M8은 실제 서버의 조회·읽음·전송과 명시적인 수동 재시도를 제공한다. M9는 같은 계정의
영속 outbox를 처리하고 WebSocket 수신과 S1 delta로 메시지를 수렴시킨다. 자동 mobile E2E와
실기기 acceptance는 전체 제품에 대해 완료하지 않았다.

현재 범위와 다음 사용자 여정은 [전체 로드맵](docs/roadmap.md)을 따른다.

- M4: bootstrap contract와 SQLite — 완료
- M5: 로컬 채팅 읽기·쓰기 — 완료
- M6: server contract intake, shared session/profile/logout, account/origin 데이터 분리 — 완료 (2026-09-09 사용자 종료 승인)
- M7: authenticated groups, membership, invitations — 완료 (2026-09-10 양 플랫폼 그룹 작업·계정 전환 사용자 확인 및 종료 승인)
- M8: 실제 주제 목록·메시지 조회·전송·내 읽음 위치 저장 — 완료 (2026-09-10 양 플랫폼 사용자 확인 및 종료 승인)
- M9: 영속 outbox·실시간/delta 동기화 — 완료 (2026-09-10 사용자 수용 4/4 확인 및 종료 승인)
- M10: 주제·태그 — 완료 (2026-09-10 양 플랫폼 사용자 수용 4/4 확인 및 종료 승인)
- M11: 미디어 업로드·첨부·접근 — 형식 호환성 재빌드 후 사용자 송수신 확인. 후속 승인으로 버튼 대비·영상 카드·앱 내 native 영상 재생 추가; 새 플레이어 재빌드·사용자 확인 대기
- 다음: 별도 빌드 승인 후 iOS·Android clean prebuild·재빌드·설치 → 영상 재생/소리/탐색·닫기와 기존 첨부/저장 회귀 확인; M11 종료는 별도 승인
- 아직 없음: notification/push

M10의 확정 범위와 순서는 [로드맵의 M10 계획](docs/roadmap.md#m10-주제태그)에 있다.
계약·데이터 연결 → 주제·태그 화면 → M9 동기화 연결 → 자동 검증·양 플랫폼 수용 순서이며,
계획 확정 후 별도 구현 승인을 받아 T1-T7, 계정별 주제 캐시, 생성·편집 화면과 기존 동기화 연결을 구현했다.
최종 전체 검사는 76 suites / 902 tests PASS이며 coverage 80% 기준을 유지했다. 독립 리뷰 수정과
재리뷰를 마쳤고, 기존 iOS·Android 설치본에서 최신 번들의 로그인 세션 복원·주제 조회·작성 화면·앱 복귀를 확인했다.
이후 사용자가 실제 생성·편집·다른 계정 동기화 등 네 항목이 양 플랫폼에서 정상이라고 확인하고
M10 종료·로컬 커밋을 승인했다. 출처별 결과와 한계는 [M10 evidence](docs/evidence/M10.md)와
[개발 검증 기록](docs/development-workflow.md#m10-구현과-focused-검증--2026-09-10)에 있다. Push·배포는 별도다.

Apple login, STT/on-device AI, presence/typing/reaction, message edit/delete와 새 push
backend는 현재 서버 계약 밖의 별도 backlog다. 의존성 보안 수정 후에도 원본 감사의 image-size
High 2건과 Android 시작 ANR 추적, 출시 범위의 실기기·E2E 수용 및 배포 revision binding은
남아 있어 production readiness는 `NOT READY`다. M6-M10 종료는 이 출시 항목들의 완료를 뜻하지 않는다.
패치 검증과 감사 결과는 [개발 검증 기록](docs/development-workflow.md)에 구분한다. 자세한 경계는
[`docs/roadmap.md`](docs/roadmap.md)와
[`docs/product-intent.md`](docs/product-intent.md)를 기준으로 한다.

## M6 server contract와 account-safe session

M6는 M4 `contracts/bootstrap/`을 대체하지 않는다. Bootstrap 정리는 사용자 결정에 따라
서버 계약 기반 앱 개발 이후로 미룬다. `contracts/server/`는 read-only
`jamye-server/contracts`의 OpenAPI 3.1/version 1 snapshot이며, 전체 wire type과 M6 schema
closure(H1/H2, A1-A5, U1)의 runtime validator/domain mapper를 별도 경계로 둔다.
`contracts/server/contract.lock`과 `intake.json`은 source revision, manifest/openapi hash와
generator identity를 기록한다. 이 snapshot은 planning/intake provenance이지 현재 배포
revision이나 production-certified contract의 증거가 아니다.

`connected-auth`는 화면별 controller가 아니라 origin별 shared session owner를 사용한다.
세션은 기존 `jamye.auth.session.v1` SecureStore record 호환성을 유지하고, 검증된 U1
`User.id` UUID가 있을 때만 `SessionPrincipal`을 공개한다. profile retry는 한 번의 refresh와
한 번의 replay만 허용하며, logout·origin/account 전환·늦은 응답은 session epoch로 fence한다.
로그아웃은 local-first이며 원격 logout 실패가 로컬 세션 삭제를 되살리지 않는다.

인증 mode에서는 M5 `jamye.db` fixture database/seed를 열지 않는다. 계정 저장소는 정규화된
HTTPS API origin과 검증된 User UUID의 결정적 digest로 별도 `jamye-account-v1-<digest>.db`
namespace를 만들고, `scope_metadata`에서 같은 origin/user/schema identity를 매번 확인한다.
기존 `jamye.db`와 fixture migration/rows/outbox는 삭제·재시드·이동하지 않는다. cold restore가
유효한 U1 profile을 얻지 못하면 account data를 복원하거나 표시하지 않는다.

M6의 profile/logout과 account-storage 경계는 보존한다. connected-auth mode는 이제 M7의
account-scoped in-memory group list/create/join/detail/roster/management 경로를 제공하며,
local-fixture mode는 M5 chat으로 계속 진입한다. M6 native/runtime 수용은 아래 실행 기록과 사용자
확인을 근거로 종료했으며, source 통합이나 자동 테스트만으로 판정한 것은 아니다. M7에는 server chat, WebSocket/delta,
outbox dispatcher, media, push와 offline authenticated restore가 없다.

2026-09-09 보안 수정 후 자동 통합 검사에서 `bun run check:code`가 43 suites/407 tests와 함께 통과했다.
전체 coverage는 statements 89.83%, branches 83.29%, functions 91.52%, lines 91.64%이며,
server/bootstrap contract drift 검사도 통과했다. 이 결과는 이번 변경의 build 또는 실계정
로그인 검증을 포함하지 않는다.

독립 요구사항 대조와 회귀 리뷰도 통과했다. 안전성 리뷰는 신규 코드의 Critical/High 문제를
찾지 못했지만, 최초 실행은 기존 dependency High 3건 때문에 `ultrawork` VERIFY gate를 보류했다.
이후 의존성 보안 수정과 회귀 검사를 수행했다. 2026-09-09 승인된 clean prebuild와
iOS·Android 재빌드·설치·앱 실행을 완료했고, 사용자가 현재 빌드의 Kakao·Google 로그인
4개 조합을 모두 확인했다. 추가로 에이전트가 양 플랫폼 세션 복원·로그아웃 유지와 Android
취소·Google 재로그인을 확인했다. 사용자가 iOS 취소 후 앱 복귀와 Kakao·Google 재로그인도
정상이라고 확인하고 M6 종료를 승인했다. 결과 출처와 종료 범위는 [M6 종료 기록](docs/oauth-development.md)에 남겼다.
Android 직접 Activity 실행 중 시작 ANR과 이후 런처 실행 성공은 별도로 기록했다.
당시 M6 실행은 실제 토큰 만료 후 갱신·실계정/origin 전환 수용을 포함하지 않았다.
실계정 전환은 이후 M7에서 별도 사용자 확인을 받았다. 실제 만료 갱신과 origin 전환은 미확인이다.

## M7 groups, membership와 invitations

M7 구현은 G1-G8/I1-I2의 검증된 server contract를 사용하는 authenticated group slice다.
그룹 목록·생성·초대 코드 참여·상세·member roster와 owner/member 관리(이름 변경, 삭제, self-leave,
member 제거, ownership transfer, 초대 발급)를 제공한다. 그룹 상태는 normalized origin, U1 user UUID와
M6 session epoch에 묶인 connected-runtime in-memory store에만 보관하며 SQLite fixture, SecureStore,
MMKV, M5 outbox에는 쓰지 않는다. 서버의 canonical mutation 응답 뒤 필요한 list/detail/roster를 refetch하고,
cursor와 owner-first 순서를 그대로 보존한다.

현재 상태는 `COMPLETED / USER_ACCEPTED`다. 2026-09-10 사용자가 양 플랫폼에서 배포 API를 통한
그룹 생성·초대·가입·나가기와 계정 전환을 확인하고 종료 기록을 승인했다. 기존 Development Build에서
M7 bundle을 실행했으며 native 설정 변경이나 재빌드는 없었다. membership loss는 authorized REST,
self-leave/delete 성공, foreground/manual refetch 범위에서 처리한다. WebSocket eviction, durable
group cache/outbox는 이 범위에 포함하지 않는다. 다른 관리 기능의 개별 실사용 확인과 검증 한계는
[M7 evidence](docs/evidence/M7.md)와 [개발 검증 기록](docs/development-workflow.md)을 따른다.

## M8 실제 서버 REST 채팅

M8은 `COMPLETED / USER_ACCEPTED`다. 그룹 상세에서 주제 목록으로 들어가 이전 메시지를
읽고 텍스트를 전송하며, 화면에 보인 서버 메시지까지 자신의 읽음 위치를 저장한다. C1-C4
계약을 사용하는 account-scoped adapter/store와 SQLite 메시지 저장소를 연결했다.
전송 실패 후 수동 재시도는 같은 UUID `client_msg_id`와 내용을 사용한다.

2026-09-10 서버 C3 수정 배포와 양 플랫폼 실행을 확인했고, 사용자가 실제 송수신·읽음 결과
표시, 한글 입력·줄바꿈, 이전 메시지 로딩·스크롤 유지, 실패 후 재시도를 모두 정상으로 확인했다.
앱의 사용자용 명칭은 '주제'이며 API 경로와 내부 `chatroom` 식별자는 유지한다.

읽음 결과는 **내 읽음 위치 저장**을 뜻한다. 메시지별 상대방 읽음 표시와 주제별 안읽음 표시는
구현하지 않았고 기존 마일스톤에도 추가하지 않는다. 새 주제 생성은 기존 M10, 실시간 수신과
자동 outbox 처리는 후속 M9에서 완료했다. 결과 출처와 검증 한계는 [M8 evidence](docs/evidence/M8.md)를 따른다.

## M9 영속 outbox와 실시간·delta 동기화

M9는 `COMPLETED / USER_ACCEPTED`다. 계정별 SQLite에 저장한 전송 의도를 같은
`client_msg_id`로 재시도하며, REST 응답과 WebSocket/S1 event를 하나의 canonical message로
수렴시킨다. S1 → R1 ticket/socket → 구독 확인 → 두 번째 S1 순서로 연결 중 누락을 복구한다.
화면은 계속 SQLite만 읽고 opaque cursor를 임의로 비교하거나 생성하지 않는다.

2026-09-10 자동 통합 검사 70 suites / 814 tests와 독립 리뷰를 마쳤다. 사용자는 새로고침 없는
송수신, 백그라운드 복귀 시 누락 복구, 오프라인 전송 대기 후 재시작·연결 복구, 계정 전환 시
이전 데이터·대기열 격리의 4개 항목을 모두 정상으로 확인하고 종료·로컬 커밋을 승인했다.
Cold offline 시작에서는 U1로 계정을 확인하기 전 데이터를 숨긴다. 자동 검사·에이전트 관찰·
사용자 확인과 미검증 범위는 [M9 evidence](docs/evidence/M9.md)에 구분한다.

## M4 local bootstrap contract

M4의 local bootstrap wire contract는 `status = bootstrap`,
`contract_version = bootstrap.v2`이다. 이 상태에서는 실제 production host나 active
transport를 정의하지 않는다. `contract.lock`은 canonical source/fixture checksum과 breaking
shape를 기록하며, `server_tag = null`, `server_commit = null`은 아직 server에 bind되지 않은
local provenance(`unbound`)라는 의도적인 표시다.

이 bootstrap은 M4의 historical/local-fixture contract다. 실제 server contract는
read-only `jamye-server/contracts`의 version 1 snapshot을 별도 `contracts/server/`로 수용했다.
non-null tag만을 필수 조건으로 두지 않고 exact source revision, contract version과 content
hash를 기록한다. 현재 manifest의 dirty/null provenance는 배포 binding을 증명하지 않는다.
M6 generated type/validator는 구현됐으며 bootstrap source/fixture는 변경하지 않았다.

Bootstrap 자체는 실제 서버에 연결하지 않는다. M8은 별도 승인된 C1-C4 server snapshot과
account-scoped 저장소로 REST 채팅을 연결했고, bootstrap source/fixture는 보존했다.
M9는 다음 조건을 모두 충족하는 별도 승인으로 server recovery를 연결했다.
Bootstrap의 transport를 활성화한 것은 아니며, 향후 연결 변경에도 같은 조건을 적용한다.

1. 별도 승인된 source가 non-bootstrap production contract version과 authenticated source
   ownership(인증된 source ownership)을 제공한다.
2. exact source revision, contract version/content hash와 approved auth/endpoint scope가
   별도 결정으로 승인된다.
3. types, fixtures, manifest, `contract.lock`을 regenerate(재생성)하고 compatibility review
   (호환성 검토)를 통과한다.
4. 해당 마일스톤의 integration decision이 contract의 실제 invocation을 별도로 승인한다.

Bootstrap의 unknown event `request_delta`는 계속 local recovery result일 뿐이며 HTTP,
WebSocket, auth 실행을 뜻하지 않는다. 실제 S1/R1 실행은 M9 server adapter의 책임이다.

## 고정 기준선

| 항목                    | 값                  |
| ----------------------- | ------------------- |
| Expo                    | `~57.0.21`          |
| React Native            | `0.86.3`            |
| React                   | `19.2.3`            |
| Expo Router             | `~57.0.20`          |
| Expo Development Client | `~57.0.18`          |
| Keyboard Controller     | `1.21.9`            |
| TypeScript              | `~6.0.3`            |
| package manager         | Bun `1.3.13`        |
| route root              | `src/app/`          |
| entry                   | `expo-router/entry` |

Expo Router의 초기 링크가 마운트 전에 상태를 갱신하는 문제는 57.0.20에도 남아 있어
`patches/expo-router@57.0.20.patch`를 유지한다. 버전 업데이트 시 원본 코드와 패치 적용 여부를
확인하며, 설치된 코드의 마운트 지연 처리는 회귀 테스트로 검사한다.

OAuth native plugin은 `expo-web-browser`와 `expo-secure-store`이며 선언 원본은
`package.json`/`bun.lock`이다. 공개 앱 scheme `jamye`는 OAuth app return용이고,
`expo-dev-client`가 생성하는 development scheme과 구분한다.

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
설정에 M4의 option-free native plugin인 `expo-sqlite`, `expo-font`를 그 순서로 등록한
단일 base fragment다. 두 plugin에는 option이나 font asset path를 넣지 않는다. `app.config.ts`는
이 JSON 전체에서 development identity와 `['expo-dev-client', { addGeneratedScheme: true }]`만
더한다. 이 generated scheme은 개발 launcher 연결용일 뿐 공개 custom scheme, universal link
또는 app link 계약이 아니다.

결정 근거는 다음 ADR에 있다.

- [`ADR 0001 — Expo SDK 57 default template`](docs/adr/0001-expo-sdk-57-default-template.md)
- [`ADR 0002 — Bun-only package management`](docs/adr/0002-bun-only-package-management.md)
- [`ADR 0003 — M2 bootstrap 품질 증거의 M3 이관`](docs/adr/0003-m2-bootstrap-quality-evidence-deferment.md)
- [`ADR 0004 — M3 앱 기반과 preference 보류`](docs/adr/0004-m3-app-foundation-and-preference-deferral.md)

## 개발 환경

CLI 개발 환경의 진입점은 repository root의 Nix flake다.

```sh
nix develop .
```

devShell 진입 뒤 사용하는 정식 Bun script, 상태 변경 범위와 표준 검증 순서는
[`docs/development-workflow.md`](docs/development-workflow.md)에 있다.

에이전트는 app과 server의 devShell 세션을 각각 한 번 열어 후속 명령에 재사용한다. 명령마다
새 환경을 만들거나 `path:.`로 로컬 산출물까지 가져오지 않는다. 상세 규칙은
[에이전트의 devShell 세션 재사용](docs/development-workflow.md#에이전트의-devshell-세션-재사용)을 따른다.

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

다음 명령은 모두 현재 프로젝트의 재사용 중인 devShell에서 실행한다. `verify`와 기본 diagnostic은
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

`local-fixture` mode는 production server, auth 또는 session 연결을 사용하지 않는다.
`connected-auth` mode가 지원하는 OAuth/profile/logout 범위와 아직 남은 연결 범위는
[OAuth 개발 연결](docs/oauth-development.md)과 [로드맵](docs/roadmap.md)을 따른다.

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

`@expo/ui`(57.0.17), `expo-symbols`(57.0.2), `expo-glass-effect`(57.0.2)는 이번 세션에서
추가된 direct dependency다. 세 패키지 모두 Expo module이며 현재 실행 중인 iOS Simulator,
Android Emulator development build에 이미 linked돼 있어 별도의 clean prebuild 없이
사용한다. `expo-image`(~57.0.5)는 후속 승인으로 추가했으며 native rebuild가 필요하므로 clean
prebuild와 iOS·Android rebuild/install을 거쳐 사용한다. 배경과 checker 정책 변경은
[ADR 0005](docs/adr/0005-native-ui-toolkit-adoption.md)를 따른다.

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
build/install 결과일 뿐 현재 JavaScript bundle의 runtime 동작 증거가 아니다. Native module인
`react-native-keyboard-controller`를 추가한 M5에서는 clean prebuild, 양 플랫폼 rebuild/install,
새 Metro bundle 재진입과 사용자 수동 관찰을 별도 게이트로 수행했다. 구체적인 실행 결과와
미실행 범위는 [M5 실행 증거](docs/evidence/M5.md)에만 기록한다.

## 현재 구조와 다음 경계

```text
src/app/                          얇은 Expo Router route와 root composition
src/core/config/                  Expo base config와 공개 environment validation
src/core/logging/                 structured redacted local logging
src/core/errors/                  root Error Boundary와 recovery UI
src/core/database/                SQLite open·migration·repository lifecycle
src/core/auth/                    A1-A4/U1 adapter, PKCE, controller와 SecureStore session
src/core/contracts/server/        server wire type·validator·domain mapper
src/core/http/                    account-safe authorized request boundary
src/core/providers/               theme·database·keyboard·runtime provider composition
src/core/theme/                   semantic light/dark token과 system theme provider
src/features/chat/data/           C1-C4 server adapter
src/features/chat/model/          fixture 및 connected chat state, send/read/lifecycle
src/features/chat/ui/             native list, row, composer, platform keyboard adapter
src/features/chat/                repository 구독 기반 conversation hook
src/features/auth/                login/profile/logout UI와 callback landing
src/features/groups/              account-scoped API·state·group/member/invite UI
src/features/sync/                account-owned outbox·delta·WebSocket·profile recovery
src/shared/ui/                    native screen/text primitive
```

- Route는 auth·chat·group screen과 root provider를 조합하고 persistence 구현을 직접 import하지 않는다.
- `AppProviders`는 startup environment를 검증하고 theme, database, native keyboard controller와
  runtime dependency를 조합한다.
- Chat screen과 UI는 유일하게 허용된 repository port를 통해 SQLite 상태를 읽고 쓴다.
- Local send는 pending message와 outbox command를 하나의 exclusive transaction으로 commit한
  뒤에만 화면에 공개한다.
- Chat list는 prepend anchor와 committed local target reveal을 조정하고, keyboard 진행 중에는
  UI-thread scroll을 사용한다.
- Theme는 React Native `useColorScheme()`만 따르며 저장 preference나 state library가 없다.
- Local fixture는 production server, HTTP, WebSocket 또는 auth를 사용하지 않는다.
- `src/app/index.tsx`는 `local-fixture`의 M5 chat과 `connected-auth`의 로그인·인증 home을
  구분한다. 인증 후에는 account-scoped M7 group route로 이동할 수 있다.
- `AppProviders`는 connected mode에서 shared session, account scope와 groups/chat store를 조합한다.
  fixture DB/seed는 local-fixture mode에서만 사용하며, 실제 계정 namespace와 분리한다.
- ESLint가 `app.config.ts`와 route/UI 계층의 직접 transport를 금지한다. 현재 허용된 실제
  네트워크 호출은 auth·health·groups·chat·sync·topics의 지정 adapter와 `src/core/http/` 경계를 통과한다.
  이후 server adapter도 별도 boundary로 승인·검증한다.

M8은 이 경계 안에서 server-backed REST chat을, M9는 persistent outbox processor와
canonical event/delta recovery를 연결했다. 실제 `jamye-server` 연결은 M6-M9의 수용 범위에
기록하며, credential과 session/token은 fixture나 문서에 보존하지 않는다.

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
