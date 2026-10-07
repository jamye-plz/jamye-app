# jamye-app 서버 계약 기반 로드맵

- 현재 상태: M0-M5 완료 이력 보존, M6 계정 안전 기반, M7 그룹·멤버십·초대, M8 REST 채팅, M9 영속 outbox·실시간/delta 동기화, M10 주제·태그 완료 (2026-09-10 M10 사용자 종료 승인), M11 미디어 업로드·첨부·접근 완료 (2026-09-16 M11 사용자 종료 승인), M12 알림함·Expo 푸시 완료 (2026-09-21 M12 사용자 종료 승인), M13 프로필 수정·계정 삭제 완료 (2026-09-22 M13 사용자 종료 승인), M14 UI/UX 다듬기 완료 (2026-09-28 M14 사용자 종료 승인, 라운드 1·2), M15 소프트 삭제 수용 완료 (2026-09-29 M15 사용자 종료 승인), M16 Sign in with Apple 완료 (2026-09-30 M16 사용자 종료 승인), M17 잔여 백로그 라운드 1 (E)·(F) 완료 (2026-10-01 사용자 종료 승인)·라운드 2 (A) 구현·기기 수용 완료 (2026-10-06, PR #8 merge `671b649`)·라운드 3 (B) 구현·검증·격리 리뷰 완료 (2026-10-07 사용자 라운드 종료 승인, PR #9; 사용자 결정으로 M17은 열어 둠), M18 스토어 배포 2026-09-22 사용자 결정으로 `planned_unapproved` 등록
- 앱 조사 기준점: `ff909de9e43367a17b5c40fb16f64708c34c25ea` (2026-09-09, clean `main...origin/main`)
- 서버 계약 조사 기준점: `7d146ab0040ba49acbc42e40b2408e3e27f6e88d`
- 현재 frontier: M17 남은 묶음의 착수 결정 — 2026-10-07 사용자가 라운드 3 (B)의 종료를 승인하고 M17은
  닫지 않기로 했다. (B) 세 항목(아바타 업로드, 계정 삭제 30일 뒤 로컬 DB 정리, bootstrap/local-fixture
  모드 제거)과 Expo SDK 57 patch 정렬은 구현, iOS 시뮬레이터·Android 에뮬레이터 검증, 격리 리뷰
  (VERIFY·REFINE·SHIP 모두 PASS)를 마치고 PR #9로 main에 들어갔다(상세는 M17 절 "(B) 결과"). 서버
  task-19(아바타 업로드)는 운영에 배포했다(jamye-server PR #18 merge `f86012e`, homelab PR #98·#99).
  직전 라운드 2 (A)는 구현·기기 수용을 마치고 PR #8(merge `671b649`, 2026-10-06)로 main에 들어갔다.
  (C)·(D)는 `planned_unapproved`다.
  라운드 1 (E)·(F)는 2026-10-01 사용자 종료 승인으로 닫았다(PR #6 merge `589c5e0`,
  [M17 evidence](evidence/M17.md)). M18 스토어 배포는 M14 만족 선언과 M16 종료 조건을 충족했고 release
  범위 확정과 별도 승인이 남아 있다.
- 앱 출시 판정: NOT READY — (A)가 다룬 image-size High 2건(트리에서 제거, 10-01 `bun audit` 0건, 10-06 재감사·B7 Expo patch 정렬 뒤 dev 도구 수정판 없는 2건만 남음)·Android 시작 ANR 분석·E2E·실기기 수용은 닫았다. release build의 cold start 측정, 아이콘·서명·빌드 파이프라인, push·OAuth production 설정과 서버 AASA/assetlinks·배포 binding(M18)이 남아 있음
- 결정권자: 사용자
- 최종 수정일: 2026-10-07

## 1. 이 문서가 답하는 것

이 로드맵은 완료율 숫자나 출시일을 약속하지 않는다. 다음 다섯 가지를 분리해서 기록한다.

1. 어떤 기반과 사용자 동작이 실제로 구현됐는가?
2. 어떤 결과가 과거 명령·native runtime·사용자 수용으로 검증됐는가?
3. 현재 앱이 실제 서버 계약 중 어디까지 호출하는가?
4. 다음 사용자 여정은 어떤 서버 계약과 선행 조건에 의존하는가?
5. 어떤 승인과 새 증거가 있어야 다음 milestone을 완료할 수 있는가?

문서에 미래 milestone을 적는 일은 구현 승인이 아니다. 각 milestone은 별도의 계획, review,
사용자 승인, 구현, 검증과 종료 결정을 거친다.

## 2. 사실의 분류

이 문서에서는 사실을 다음과 같이 구분한다.

- **현재 정적 확인**: 2026-09-09 기준 Git, source와 contract를 읽어 확인한 사실
- **역사적 실행 증거**: M1-M5 당시 실행·실패·복구·수용 기록
- **사용자 확인**: 사용자가 실제 simulator/emulator나 provider 계정에서 확인했다고 공유한 결과
- **미검증**: 코드나 문서가 있어도 이번에 다시 실행하지 않은 검사, 배포 또는 runtime 결과
- **현재 구현 증거**: M10 전체 자동 검사·독립 리뷰 PASS, 양 플랫폼 사용자 수용 4/4 및 종료 승인. M11은 2026-09-15 expo-image·expo-video 포함 양 플랫폼 clean prebuild·재빌드·설치, 포스터 송수신·realtime 반영 검증(전체 129 suites / 1,370 tests PASS)을 거쳐 2026-09-16 사용자 종료 승인. 기존 PUT-only native·picker 생명주기 리뷰 이력은 보존. M12는 2026-09-16 전체 자동 검사(145 suites / 1,573 tests PASS, coverage 87.37%/82.48%/88.31%/90.22%)와 독립 리뷰 3건(Alignment/Safety/Regression) PASS를 거쳤고, 2026-09-20~21 재빌드(Android 에뮬레이터·iOS 시뮬레이터·iPhone 15 Pro 실기기)와 실기기 푸시 수신·탭 handoff·미리보기 off·기본 대화방 알림 검증(서버 PR #6·#7 배포 포함)을 거쳐 2026-09-21 사용자 종료 승인([M12 evidence](evidence/M12.md)). M13은 2026-09-22 사용자 디바이스 확인과 종료 승인([M13 evidence](evidence/M13.md)), M14는 라운드 1·2의 양 플랫폼 기기 검증을 거쳐 2026-09-28 사용자 종료 승인([M14 evidence](evidence/M14.md))
- **미래 계획**: M15-M18은 `planned_unapproved`; 2026-09-22 로드맵 등록은 구현 승인이 아니며, M13·M14 종료 승인도 후속 범위 승인은 아님

기능 완료율 하나로 이 분류를 합치지 않는다. 과거 milestone PASS를 현재 dependency, 배포나
production readiness의 증거로 재사용하지 않는다.

## 3. 지금까지의 기록

### 3.1 완료된 M0-M5

| 구간                 | 상태      | 보존할 결과                                                                              | 증거와 한계                                                                                                                                   |
| -------------------- | --------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 감독형 작업 방식  | completed | 사용자 결정권, 명령 카드와 milestone gate                                                | 당시 계획 이력. 이후 roadmap 변경을 소급 적용하지 않음                                                                                        |
| M1 개발 환경         | completed | Nix devShell과 mobile toolchain baseline                                                 | [M1 evidence](evidence/M1.md). 당시 toolchain/flake 결과이며 앱 기능 증거가 아님                                                              |
| M2 Expo/Bun scaffold | completed | Expo SDK 57 line과 Bun-only scaffold                                                     | [M2 evidence](evidence/M2.md). Expo Go smoke이며 lint/coverage는 당시 미측정                                                                  |
| M3 앱 기반           | completed | Development Build/CNG, thin route, theme/error/logging/env와 quality harness             | [M3 evidence](evidence/M3.md). 당시 fixture smoke이며 제품 E2E가 아님                                                                         |
| M4 SQLite/bootstrap  | completed | SQLite v1 repository와 unbound `bootstrap.v2` contract                                   | [M4 evidence](evidence/M4.md). 실제 server contract나 transport가 아님                                                                        |
| M5 로컬 채팅         | completed | SQLite-only chat, atomic pending/outbox, stable retry, Korean IME와 native keyboard/list | [M5 evidence](evidence/M5.md). 당시 20 suites/193 tests와 양 platform Simulator/Emulator local 수용; network/auth/physical-device 증거가 아님 |

M4의 bootstrap 계약과 M5의 local-fixture 실행 경로(`jamye.db`)는 2026-10-06 M17 라운드 3 (B)에서 코드·계약·도구와
함께 제거했다(M17 절 "(B) 결과"). 위 표는 당시 기록이다.

M1-M5 evidence는 각 시점의 기록이므로 현재 package version이나 새 roadmap에 맞춰 고쳐 쓰지
않는다. 원래 roadmap 전문은 Git 기준점 `ff909de`의 blob
`b54bf80d94d97888b938bac540dfef73fa6694cf`에 남아 있다.

```sh
git show ff909de:docs/roadmap.md
```

별도 tracked archive 문서를 추가하지 않는 이유는 Git이 원문을 보존하고, 새 문서 경로는 현재
architecture exact-path 정책 변경까지 요구하기 때문이다.

### 3.2 M5 이후 실제 OAuth 추가와 M6 shared session

Commit `ff909de`에서 Kakao/Google OAuth authorize·exchange, refresh, logout, profile,
PKCE, SecureStore와 native callback bridge가 추가됐다. 당시 `connected-auth` mode(지금은 유일한 실행 경로)에서 이 흐름이
shared session과 U1 profile을 제공하며, M6에는 별도의 health 연결 진단도 있다.

초기 OAuth 수용 이후 M6와 의존성 보안 패치를 포함해 clean iOS/Android rebuild·설치를
다시 완료했다. 2026-09-09 사용자는 현재 빌드에서 양 platform × 양 provider의 실계정 로그인
4개 조합이 모두 성공했다고 확인했다. 이후 에이전트는 양 플랫폼 profile/account storage와
앱 재시작 복원·로그아웃 유지, Android Kakao 취소·Google 재로그인을 관찰했다. 사용자는
iOS 취소 후 앱 복귀와 Kakao·Google 재로그인도 정상이라고 확인하고 M6 종료를 승인했다. 자세한 기록은
[OAuth 개발 연결](oauth-development.md)에 있다.

M6 종료 당시 아래 항목은 전체 PASS가 아니었다. 이후 그룹 navigation과 실계정 전환은
[M7 evidence](evidence/M7.md), REST 채팅 navigation과 사용자 수용은 [M8 evidence](evidence/M8.md)에
별도 기록하며, 나머지 항목까지 PASS로 확대하지 않는다.

- 실제 token 만료 뒤 refresh
- 실계정/origin 전환과 네트워크 장애 수용
- Android 직접 Activity 실행 중 발생한 시작 ANR의 원인 규명
- 로그인 뒤 group/chat으로 이어지는 navigation
- physical device, VoiceOver/TalkBack, 200% text, reduce motion
- automated mobile E2E와 production 배포 revision binding

따라서 OAuth는 M5에 소급 포함하지 않고, 기존 M6-M8의 완료 근거로도 사용하지 않는다.

### 3.3 현재 실행 경로

현재 실행 경로는 하나다. `EXPO_PUBLIC_APP_MODE`로 고르던 app mode(`local-fixture`: M5의 SQLite local
chat, `connected-auth`)는 2026-10-06 M17 (B)에서 없앴다. API·미디어 origin(`EXPO_PUBLIC_API_ORIGIN`,
`EXPO_PUBLIC_MEDIA_ORIGIN`)이 필수이고 누락하면 앱이 시작할 때 오류를 낸다.

- 연결 경로: 로그인 뒤 그룹·알림·계정 탭([ADR 0009](adr/0009-tab-bar-navigation.md))으로
  들어간다. 그룹 목록 → 그룹 홈(날짜별 주제 목록)에서 주제 대화방·주제 상세나 그룹 기본 대화방에
  들어가 메시지 조회, 텍스트·사진·동영상·음성 전송, 수동 재시도와 내 읽음 위치 저장을 사용하며 M9의
  실시간·delta 복구를 재사용한다. 알림 탭은 알림함(M12), 계정 탭은 닉네임·프로필 사진 변경, 로그아웃, 계정
  삭제(M13, 사진은 M17 (B))를 제공하고, 푸시나 알림 항목을 누르면 해당 대화방이나 주제로 이동한다.

기존 `jamye.db`와 fixture conversation은 더는 열지 않는다(개발 기기에 남은 `jamye.db` 파일은 지우지
않았다). 앱은 shared session과 account scope를 사용한다. 계정 namespace는
정규화된 HTTPS origin과 검증된 U1 User UUID의 digest로 분리되며 `scope_metadata` identity를
매번 확인한다. Logout/account switch 뒤 이전 account의 row/outbox/late response가 새 account에
표시·전송되지 않도록 session epoch와 account-scope open/close drain으로 fence한다. cold restore가
검증된 U1 profile을 얻지 못하면 authenticated account data를 표시하지 않는다. 계정 삭제가 성공하면
그 계정의 DB 파일 이름(해시)과 삭제 시각을 기기에 기록하고, 30일이 지난 뒤 처음 앱을 열 때 그 DB를
지운다(M17 (B)).

## 4. 서버 계약을 어떻게 사용할 것인가

### 4.1 계약 기준과 provenance

최초 로드맵 조사 기준은 read-only `jamye-server/contracts/`의 아래 snapshot이다.
이후 M8에서 수용한 C3 `message_id` 계약의 source revision과 hash는 현재
`contracts/server/contract.lock` 및 [M8 evidence](evidence/M8.md)로 구분한다.

- OpenAPI 3.1, contract version `1`
- HTTP 43 operations, 32 paths
- Realtime current version `1`, previous version `0`
- known event: `message.created`, `topic.created`
- manifest stage: `release_candidate`
- manifest `server_commit: dirty`, `server_tag: null`
- manifest의 계약 묶음 checksum (`sha256`): `d2b88eddfa47bc88ad84f64c4dc80cc853cc86ac42254b7817e7b65b3b6f8d66`

이 checksum은 manifest의 `checksum_algorithm`이 정의한 계약 묶음의 값이며,
`manifest.json` 파일 하나의 byte hash가 아니다.

Server checkout commit과 contract content hash/version은 future intake의 재현 가능한 planning
snapshot으로 기록한다. 그러나 manifest metadata가 실제 deployment revision에 bind됐다고
확인되지 않았으므로 이를 production-certified contract라고 부르지 않는다. 배포 binding이나
server 수정이 필요하면 별도 server 작업으로 승인받는다.

계약 수용 시에는 exact source revision과 content hash/version에서 type과 validator를 생성하고,
app domain mapper를 둔다. 문서 변경마다 tag, manifest, 승인 hash를 중첩하는 새 immutable
evidence generation 체계는 만들지 않는다.

### 4.2 Bootstrap과 실제 계약의 핵심 차이

이 표는 M6 intake 당시의 비교 기록이다. M4 bootstrap 계약은 2026-10-06 M17 (B)에서 제거했고 서버
계약만 남았다.

| 주제        | M4 bootstrap                                            | server contract v1                                                                          | future app rule                                    |
| ----------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 메시지 전송 | `/bootstrap/v1/conversations/{id}/messages`             | `POST /api/v1/chatrooms/{chatroom_id}/messages`                                             | 실제 API adapter와 mapper 사용                     |
| 멱등 ID     | `client:timestamp:entropy:counter`                      | UUID `client_msg_id`                                                                        | 새 send는 UUID, retry는 같은 ID와 payload 재사용   |
| 전송 응답   | event와 checkpoint                                      | `CanonicalMessage`; 201/200/409                                                             | REST canonical 결과와 event checkpoint 분리        |
| event shape | `message.upsert`, `payload`, ms/sequence                | `message.created`, `data`, `occurred_at`, opaque cursor                                     | 없는 event ID/sequence를 만들지 않음               |
| delta       | `after_cursor`, events/checkpoint/has_more              | `after`, `items`, `next_cursor`                                                             | 실제 paging/terminal 의미를 따름                   |
| cursor      | numeric sequence와 결합                                 | opaque last-applied cursor                                                                  | 문자열·숫자 대소 비교 금지, commit 뒤 이동         |
| SQLite      | fixture-only, nonempty body, sent에 event+sequence 필수 | main/topic room, nullable body/sender/client ID, media, REST response에 event metadata 없음 | 기존 DB를 삭제하지 않는 migration/namespace 설계   |
| account     | 고정 fixture identity                                   | authenticated user와 membership                                                             | origin/account partition과 stale-work cancellation |

### 4.3 Realtime·media·push 안전 경계

- App outbox는 사용자의 전송 의도이고 server worker outbox는 committed server event 발행이다.
  같은 책임으로 취급하지 않는다.
- REST response와 WS/delta event는 message convergence mapper를 공유할 수 있지만, event
  checkpoint는 validated event를 DB에 적용한 뒤에만 이동한다.
- `subscribed`를 authoritative membership join barrier로 사용하고 그 경계의 누락을 delta로
  복구한다.
- Raw access token을 WebSocket URL에 넣지 않고 R1의 one-time ticket을 사용한다.
- 4001 membership eviction, 4401 auth failure/expiry와 426 contract upgrade required를 서로
  다른 recovery로 처리한다. 426을 무한 retry하지 않는다.
- Unknown event는 cursor를 진행시키지 않고 마지막 applied cursor 뒤의 S1을 bounded하게 요청한다.
- Media access는 API가 반환한 signed URL 전체를 그대로 사용한다. Media host에 API bearer나
  MinIO credential을 전달하지 않는다.
- Mobile push installation provider는 `expo`, platform은 `ios`/`android`다. PWA의
  WebPush/VAPID를 mobile contract로 가져오지 않는다.

## 5. 이전 M6-M8의 처분

기존 roadmap의 다음 항목은 **완료되지 않은 superseded proposal**이다.

| 이전 제안                               | 이전 의도                                            | 새 위치                                                         |
| --------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| 구 M6 anonymous fixture outbox/realtime | restart, dedupe, delta gap 복구를 test double로 검증 | 실제 server REST chat은 M8, durable outbox/realtime은 M9        |
| 구 M7 chat E2E/native Development Build | 완성된 local fixture slice의 양 platform 검증        | 각 qualifying milestone의 native gate와 공통 release acceptance |
| 구 M8 첫 fixture vertical slice 종료    | 문서/실기기/배포 경계 정리                           | 공통 cross-milestone release acceptance                         |

재사용할 offline/recovery/native acceptance 의도는 새 milestone에 옮기되, 구 M6-M8을 실패나
완료로 바꾸지 않는다.

## 6. 앞으로의 흐름

```text
M0-M5 completed history
  + post-M5 OAuth implemented / partially accepted
  ↓
M6 server contract intake + account-safe authenticated shell
  ↓
M7 groups, membership and invitations
  ↓
M8 authenticated REST chat
  ↓
M9 durable outbox + realtime/delta convergence
  └─→ M10 topics and tags
        ├─→ M11 media
        └─→ M12 notification inbox + Expo push
M6 ─→ M13 account profile update + deletion lifecycle
  ↓
M13 completed (2026-09-22)
  ↓
M14 UI/UX 다듬기 completed (2026-09-28, round 1·2)
  ├─→ M15 소프트 삭제 수용 completed (2026-09-29) ← server task-14
  ├─→ M16 Sign in with Apple completed (2026-09-30) ← server task-15
  └─→ M17 잔여 백로그 (라운드 1 (E)·(F) completed 2026-10-01, 라운드 2 (A) completed 2026-10-06 PR #8, 라운드 3 (B) completed 2026-10-07 PR #9, M17 열림) ← server task-16 (일부), task-19 (아바타)
M14 만족 선언 (충족) + M17(A) 해소 (PR #8 머지, 충족) + release 범위 확정 ─→ M18 스토어 배포

selected completed scopes ─→ common release acceptance
```

M10-M12의 구현 순서는 contract와 제품 우선순위를 다시 확인한 뒤 조정할 수 있다. M13은 M6의
account-safe session을 선행 조건으로 하는 독립 account lifecycle이며 media나 push 완료를 요구하지
않는다. Release acceptance는 번호가 붙은 catch-all milestone이 아니라, 실제 선택·구현한 범위에만
적용하는 공통 gate다.

M14-M18은 2026-09-22 사용자 결정으로 등록했다. M14는 라운드 1·2를 거쳐 2026-09-28 사용자 만족
선언과 종료 승인으로 완료했고, M15는 2026-09-29 사용자 종료 승인으로 완료했다. M16은 2026-09-30
사용자 종료 승인으로 완료했다. M17은 2026-10-01 라운드 1 (E)·(F)를 사용자 종료 승인으로 닫았고
같은 날 (A) 착수를 승인했고, (A)는 2026-10-06 구현과 기기 수용을 마치고 PR #8(merge `671b649`)로 머지했다. 같은 날 사용자가 M17을
닫지 않고 남은 라운드를 진행하기로 결정해 (B)를 라운드 3으로 착수했고, 2026-10-07 구현·검증·격리 리뷰를
마치고 PR #9로 머지한 뒤 사용자 종료 승인으로 닫았다. M17의 나머지 묶음((C)·(D))과 M18은 `planned_unapproved`로 남아 각각 별도
승인으로 착수한다.
M18은 M14 만족 선언(충족)과 release 범위 확정 뒤에만 시작하며, 10.2절의 공통 release acceptance를
실제 선택한 범위에 적용한다. 서버 측 작업(task-14-16, task-19)은 jamye-server 저장소의 로드맵 문서가 소유한다.

## 7. 서버 계약 기반 milestone

### M6. 서버 계약 수용과 계정 안전 기반

- 상태: `completed` — 2026-09-09 사용자 최종 세션 확인 및 종료 승인
- 구현 기준: 로컬 commit `909acd3`; 종료 기록은 [OAuth 실행 검증](oauth-development.md)
- 선행: M0-M5 이력, post-M5 OAuth baseline, 승인된 M6 PLAN_GATE
- 사용자 결과: 로그인 성공 뒤 authenticated home/profile에 진입하며 fixture 데이터가 로그인
  account에 보이거나 전송되지 않는다.
- 계약 범위: Health 진단, OAuth/session과 현재 profile read

핵심 작업:

- Server revision `7d146ab`과 contract version/content hash를 planning snapshot으로 수용
- Generated type/validator와 domain mapper 경계를 만들고 bootstrap을 runtime server contract로
  오인하지 않게 분리
- AuthScreen 내부 controller를 shared session owner로 이동하고 authenticated navigation 제공
- Refresh single-flight, callback/cancel, logout/account-switch generation과 stale request 취소
- Auth mode의 fixture seed를 중단하고 origin/account별 DB/cache/outbox namespace와 preserving
  migration 결정
- Health는 연결 진단으로만 사용하고 제품 기능 완료율에 포함하지 않음

완료 증거:

- Exact snapshot version/hash와 generated drift check
- 로그인 → authenticated home, cold restore, refresh, logout, cancel과 account switch의 자동/수동 결과
- 이전 account의 row/outbox/late result가 새 account에 노출·전송되지 않는 test
- 기존 fixture DB를 조용히 삭제하지 않았다는 migration/integrity evidence
- Native-affecting 변경이 있을 때만 clean prebuild와 양 platform rebuild/install/runtime acceptance
- UI/provider 통합을 포함한 전체 자동 검사는 통과했다. mocked/automated test 통과로
  native/user acceptance를 추론하지 않음

현재 자동 결과(2026-09-09 보안 수정 후): `bun run check:code` 통과, 43 suites/407 tests.
TypeScript/ESLint/Prettier/architecture와 server/bootstrap contract drift 검사도 통과했다.
전체 coverage는 statements 89.83%, branches 83.29%, functions 91.52%, lines 91.64%다.
account lifecycle은 전체 open/close transition을 직렬화하고, provider는 user/epoch/origin/logout
변경의 첫 render부터 이전 DB handle을 숨긴다. 최종 문서 5개/참조 110개 검사에서 broken reference는
없었다. 독립 요구사항/회귀 리뷰도 통과했고 회귀 리뷰는 374개 테스트 통과를 재확인했다.
최초 안전성 리뷰의 신규 코드 Critical/High 발견은 없었으나, 기존 dependency High 3건으로
`ultrawork` VERIFY gate를 보류했다. 이후 사용자 승인으로 보안 수정판과 재현 가능한 패치를
적용했다. 원본 감사에 남는 image-size High 2건과 패치 검증은 [개발 검증 기록](development-workflow.md)에
구분한다. 이후 clean prebuild와 양 플랫폼 재빌드·설치·실행을 완료했고, 사용자가 현재
빌드의 iOS Kakao·Google, Android Kakao·Google 실계정 로그인 성공을 모두 확인했다.
추가 세션 확인에서 양 플랫폼 복원·로그아웃 유지, Android 취소·재로그인이 통과했다.
이후 사용자가 iOS 취소 후 앱 복귀와 Kakao·Google 재로그인도 정상임을 확인하고 M6 종료를
승인했다. 따라서 서버 계약 수용과 계정 안전 기반 범위를 `completed`로 정식 종료한다.
실제 토큰 만료·refresh, 오류·실계정/origin 전환까지 PASS로 확대하지 않는다.
Android 직접 Activity 실행 중 발생한 시작 ANR과 이후 런처 실행 성공은
[개발 검증 기록](development-workflow.md)에 구분한다. `bootstrap` 정리는 M6 종료 조건이
아니며, 사용자 결정에 따라 서버 계약 기반 앱 개발 이후로 미룬다.

### M7. 그룹·멤버십·초대

- 상태: `COMPLETED / USER_ACCEPTED` — 2026-09-10 양 플랫폼 검증 확인 및 사용자 종료 기록 승인
- 선행: M6
- 사용자 결과: group을 만들거나 invite로 참여하고, group 목록·상세·member를 보며 권한에 맞는
  관리 action을 수행한다.
- 계약 범위: Groups/members, Invitations

핵심 작업:

- Group create/list/detail/update/delete와 member list/remove/role update
- Invite 발급·참여와 invalid/expired/full/forbidden/rate/permission 상태
- Membership removal 뒤 protected screen 이탈, subscription/outbox/cache 차단
- Re-fetch와 optimistic UI가 server authority를 덮지 않는 상태 소유권

구현은 G1-G8/I1-I2만 다루며, M6 authorized executor의 401 single-flight·epoch fence와
normalized origin/U1 user/epoch account-scoped in-memory store를 재사용한다. G2/G4 cursor는
opaque하게 전달하고 server order를 보존한다. membership loss는 authorized REST 응답,
self-leave/delete 성공, foreground/manual refetch 범위에서만 처리하며 WebSocket eviction은 M9다.
SQLite fixture/bootstrap, SecureStore/MMKV cache와 M5 outbox는 변경하지 않았다.

완료 증거:

- 권한별 happy/error path와 account isolation test
- User-visible loading/empty/retry/destructive confirmation/accessibility state
- 실제 배포 API를 호출하면 test account/data mutation 범위를 사전 승인하고 cleanup 결과 분리

현재 focused 결과는 여러 별도 실행의 합이므로 aggregate로 합산하지 않는다. task1 6 suites/92
tests, M6 관련 회귀 10 suites/62 tests, architecture fixture 72 tests, auth cancellation follow-up
2 suites/41 tests, task2 API/state/error 3 suites/65 tests, provider/app-provider 2 suites/18 tests,
management/store/connected-index 3 suites/27 tests, groups home/detail/connected-index 3 suites/24 tests가
각각 기록됐다. 최종 aggregate `rtk proxy bun run check:code`는 exit 0으로 51 suites/551 tests,
statements 90.16%, branches 83.40%, functions 92.62%, lines 92.49%를 통과했다. contract
checker도 `status:ok`, exit 0이며 transport/architecture regression 2 suites/75 tests가 통과했다.
이후 기존 Development Build에서 양 플랫폼 M7 실행을 확인했다. 사용자가 실제 배포 API를 통한
그룹 생성·초대·가입·나가기와 계정 전환을 양 플랫폼에서 확인하고 종료 기록을 승인해 M7을 닫았다.
이름 변경·소유권 이전·다른 멤버 제거·그룹 삭제의 개별 실사용 확인과 검증 데이터 정리는
보고받지 않았으며, 앱 전체 production readiness는 별도다. 출처와 확인 범위는
[M7 evidence](evidence/M7.md)를 따른다.

### M8. 실제 서버와 연결한 REST 채팅

- 상태: `completed` — 2026-09-10 양 플랫폼 사용자 확인 및 종료 승인 (`COMPLETED / USER_ACCEPTED`)
- 선행: M6, M7
- 사용자 결과: 실제 group chatroom에 들어가 history를 읽고 read state를 갱신하며 text message를
  전송한다. M5의 IME, anchor, keyboard와 accessibility 품질을 유지한다.
- 계약 범위: Chatrooms/messages/read

핵심 작업:

- Group의 chatroom list, message history, read checkpoint와 send adapter
- UUID `client_msg_id` 생성과 retry identity/payload 보존
- 201 new, 200 same request, 409 different payload를 구분
- `CanonicalMessage`의 nullable body/sender/client ID와 media/tombstone-safe rendering
- Local UI key와 server message ID를 분리하고 REST response에 event metadata를 만들지 않음
- SQLite v1을 데이터 삭제 없이 migration하고 local-fixture mode를 보존(M8 당시 결정; mode는 M17 (B)에서 제거)

완료 증거:

- Contract validator/mapper, pagination, permission/removed membership와 send idempotency test
- Local optimistic message가 exactly one canonical server message로 수렴
- iOS/Android에서 Korean IME, prepend/latest anchor와 error/retry 수동 확인

그룹 → 주제 목록 → 실제 메시지 화면, account-scoped SQLite 저장소와 C1-C4 adapter를 연결했다.
C3는 실제 보인 서버 `message_id`로 내 읽음 위치를 저장하며, 상대방의 메시지별 읽음 상태를
표시하는 기능이 아니다. 서버 C3 보강과 리뷰 수정은 별도 승인으로 배포했다.
앱 자동 통합 검사와 양 플랫폼 실행 확인 이후 사용자가 송수신·읽음 결과 표시,
한글 입력·줄바꿈, 이전 메시지 로딩·스크롤 유지, 실패 후 재시도를 모두 정상으로 확인했다.
구현·자동 검사·서버 배포·사용자 수용의 출처와 종료 한계는 [M8 evidence](evidence/M8.md)에 기록한다.

사용자는 M8과 기존 후속 마일스톤의 범위를 유지하기로 결정했다. 메시지별 상대방 읽음 표시와
주제별 안읽음 표시는 이번에 추가하거나 후속 마일스톤에 배정하지 않는다. 필요할 때 사용자가
별도로 요청한다. 새 주제 생성은 기존 M10, 실시간/delta와 자동 outbox는 기존 M9 그대로다.

### M9. 영속 outbox와 실시간·delta 동기화

- 상태: `completed` — 2026-09-10 사용자 수용 4/4 확인 및 종료 승인 (`COMPLETED / USER_ACCEPTED`)
- 선행: M8
- 사용자 결과: Offline send가 restart를 견디고 online 복귀 뒤 한 번만 수렴하며, reconnect 중
  빠진 event를 잃지 않는다.
- 계약 범위: Delta sync, realtime ticket와 WebSocket

핵심 작업:

- Persistent queued/in-flight/acked/failed transition, restart recovery와 bounded backoff
- REST canonical response와 event checkpoint의 분리된 atomic apply
- Opaque cursor를 last-applied checkpoint로 저장하고 S1 `after`/`items`/`next_cursor` 사용
- Delta → ticket/socket → subscribed barrier → second delta의 race-window closure
- Foreground, network regain, reconnect single-flight와 duplicate event dedupe
- 4001 eviction, 4401 auth expiry/failure, 426 upgrade와 unknown-event recovery
- Logout/account switch에서 queued/in-flight work와 socket registry cleanup

완료 증거:

- Duplicate, lost response, lost event, restart, foreground/reconnect와 membership eviction integration tests
- Same `client_msg_id` retry와 exactly one canonical result
- Unknown event에서 cursor unchanged와 bounded S1 reconcile scope
- 양 platform offline → terminate → restart → online runtime acceptance

계정별 영속 outbox, S1/R1/WebSocket adapter, event/checkpoint atomic apply와 foreground/reconnect
생명주기를 기존 채팅 화면에 연결했다. 자동 통합 검사 70 suites / 814 tests, 독립 리뷰와
양 플랫폼 실행 준비 이후 사용자가 안내한 4개 수용 항목을 모두 정상으로 확인했다.
에이전트의 제한된 실행 관찰과 사용자 확인은 [M9 evidence](evidence/M9.md)에 구분한다.
강제 프로토콜 오류·멤버십 제거의 자동 회귀를 실서버 수동 검증으로 확대하지 않는다.

### M10. 주제·태그

- 상태: `COMPLETED / USER_ACCEPTED` — 2026-09-10 양 플랫폼 사용자 수용 4/4 및 종료·로컬 커밋 승인
- 구현 상태: 1-3 구현, 전체 76 suites / 902 tests 및 독립 재리뷰 PASS; 양 플랫폼 실행 관찰 이후 사용자 확인 완료
- 선행: M7, M9
- 사용자 결과: 날짜별 topic을 보고 생성·상세·수정·tag 관리 후 topic chatroom에 들어간다.
- 계약 범위: 기존 server v1 T1-T7, `topic.created`, S1의 `group_topics` 복구 표시
- 난이도: Complex — 계약·계정별 저장소·화면·동기화가 연결되지만 새 채팅 엔진이나 서버 API를 만들지 않음
- 결정권자: 사용자; 계획·구현·전체 검증·양 플랫폼 실행·종료·로컬 커밋을 순서대로 승인했으며 push·배포는 별도

#### 승인 기준과 사용자 흐름

M9 종료 기준 앱 commit은 `33e0ce2cf2a13cd57a6f17e5f00397005f51dff0`이고, 검토한 서버 checkout은
`5decfbca9e719e7932a941e5af764cca3156f2f6`다. 앱에 보관된 [OpenAPI](../contracts/server/openapi.json)와
`topic.created` schema는 검토한 서버 사본과 byte가 같았다. 이는 저장소 정적 확인이며 현재 배포
revision을 검증했다는 뜻은 아니다. 새 intake나 server contract 변경을 기본 선행 작업으로 두지 않는다.

그룹 → 기본 주제 또는 날짜별 주제 목록 → 주제 생성·상세·편집 → 해당 주제의 대화로 이동한다.
기본 주제는 날짜별 topic 목록과 구분해 유지하며, 기존 M8/M9의 메시지·읽음·outbox·동기화를 재사용한다.
새 주제 카드에는 ID 대신 제목과 작성자 등 계약의 표시 데이터를 사용한다. API의 `topic`/`chatroom`
식별자는 바꾸지 않으며 화면에서는 '주제', main room은 '기본 주제'라고 부른다.

#### 승인 API와 입력 규칙

모든 요청은 기존 shared session의 Bearer 인증을 사용한다. 표의 경로는 `/api/v1` 기준이다.
Wire schema가 권위 원본이며 앱 내부 이름 변환은 mapper가 맡는다.

| API | Method / path                                   | 요청과 성공 응답                                              | 권한                    |
| --- | ----------------------------------------------- | ------------------------------------------------------------- | ----------------------- |
| T1  | POST `/groups/{group_id}/topics`                | `TopicCreate` → 201 생성 / 200 동일 재시도의 `CanonicalTopic` | 그룹 멤버               |
| T2  | GET `/groups/{group_id}/topics/dates`           | `after`, `limit` → `TopicDatePage`                            | 그룹 멤버               |
| T3  | GET `/groups/{group_id}/topics`                 | `after`, `limit`, 선택 `date` → `TopicPage`                   | 그룹 멤버               |
| T4  | GET `/groups/{group_id}/topics/{topic_id}`      | → `CanonicalTopic`                                            | 그룹 멤버               |
| T5  | PATCH `/groups/{group_id}/topics/{topic_id}`    | `TopicPatch` → `CanonicalTopic`                               | 작성자만                |
| T6  | PUT `/groups/{group_id}/topics/{topic_id}/tags` | `TagReplace` → `TagPage`                                      | 작성자 또는 그룹 소유자 |
| T7  | GET `/groups/{group_id}/topics/{topic_id}/tags` | `after`, `limit` → `TagPage`                                  | 그룹 멤버               |

- 날짜는 서울 달력 기준이며 T2의 `today`를 사용한다. 날짜 선택은 조회 필터이지 과거 날짜로 생성하는 기능이 아니다.
- T2 page limit은 기본 31/최대 366, T3은 20/100, T7은 50/100이다. 모두 최소 1이며 `after`와
  `next_cursor`는 서버 값을 그대로 사용한다. 날짜를 바꾸면 이전 목록 page cursor를 재사용하지 않는다.
- T1은 제목만 받는다. Trim 후 1-256 Unicode 문자이며 새 주제는 `seed`, 본문은 null이다.
  같은 생성 시도의 UUID `Idempotency-Key`와 요청 payload를 재시도에도 유지하고 중복 submit을 막는다.
  제목을 바꾼 새 시도와 결과를 모르는 이전 시도를 구분하며 409를 새 key로 자동 우회하지 않는다.
- T5는 작성자만 제목·본문을 수정한다. 그룹 소유자라도 다른 작성자의 본문은 수정할 수 없다.
  필드 생략/null은 변경 없음이고 빈 본문은 거부된다. 본문 추가 시 `enriched`가 되며 본문 비우기나 주제 삭제를 제공하지 않는다.
- T6는 태그 전체 목록 교체다. 전체 기존 태그를 확인한 뒤 저장하며 일부 page만 읽고 나머지를 삭제하지 않는다.
  태그는 trim 후 1-64 문자, 중복을 거부하고 사용자 입력은 `source: user`로 보낸다. 변경하지 않은
  태그의 `source`/`confidence`를 보존하며 AI 생성 기능은 추가하지 않는다. 빈 배열은 태그 전체 제거다.
- 응답의 group/topic/chatroom identity와 runtime schema를 검증한다. 수정 버튼 노출만으로 권한을 신뢰하지 않는다.
  401은 기존 인증 복구, 403/404는 접근 상실·없는 대상, 409는 멱등 충돌, 422는 입력 오류,
  통신 오류/503은 입력을 보존한 재시도로 구분한다. Raw response, token, 사용자 입력을 진단 로그에 남기지 않는다.
- 주제 생성·편집은 온라인 요청과 명시적 재시도까지다. M9 메시지 outbox에 주제 command를 추가하거나
  오프라인 생성·수정 예약을 만들지 않는다.

#### 데이터와 동기화 경계

기존 origin + U1 UUID + session epoch 격리를 재사용한다. 주제 snapshot과 날짜별 page 상태,
태그는 계정별 repository 경계에서 관리하고 채팅 메시지의 SQLite 원본을 유지한다. 필요한 저장소
변경은 기존 DB·메시지·outbox·checkpoint를 보존하는 additive migration으로 구현·검증한다.
구체적인 table/file inventory는 구현 단계에서 필요한 최소한으로 정하며 새 저장 엔진은 추가하지 않는다.

`topic.created`는 새 topic chatroom의 event이고 기본 주제에는 별도의 안내 `message.created`가 온다.
새 방을 아직 모르는 앱이 `topic.created`만 구독해서 모든 새 주제를 발견할 수 있다고 가정하지 않는다.
이 구조는 [주제 계약 fixture](../../jamye-server/contracts/contributions/task-7/fixtures/topic-flow.json)와
[서버 event 생성](../../jamye-server/src/adapters/postgres/topics/mutation.rs)에 근거한다.

1. 목록 진입·앱 복귀·재연결과 생성 성공 후 T2/T3 및 필요한 C1/T4를 재조회한다.
2. 선택한 그룹의 기본 주제와 필요한 topic room을 기존 account sync에서 관리한다. 기본 주제의
   이벤트는 목록 갱신 신호로 사용하되 연속 요청을 single-flight/coalescing으로 합친다.
   안내 문장의 Markdown 링크를 파싱해 주제 식별자나 데이터를 만들지 않는다.
3. WS의 `topic.created`는 기존 validator를 거쳐 S1 복구를 요청한다. WS cursor를 바로 checkpoint로 저장하지 않는다.
   현재 S1은 topic event 전문이 아니라 `reconcile_scope: group_topics` 표시를 반환하므로 그 schema를 유지한다.
4. M9에 영속된 `group_topics` 복구 표시를 해당 그룹의 주제 재조회에 연결한다. 검증된 결과를 저장한 뒤
   해당 표시만 해제하고, 실패·취소·새 event 도착 시 표시를 잃지 않도록 한다. 오래된 표시는 재시작 뒤에도 복구한다.
5. T5/T6 변경에는 별도 realtime event를 가정하지 않는다. 저장 직후 해당 목록·상세를 갱신하고
   다른 기기의 변경은 화면 복귀·새로고침에서 확인한다. 항상 즉시 원격 편집이 반영된다고 약속하지 않는다.
6. 그룹·날짜·topic·계정이 바뀐 뒤 늦게 도착한 조회/편집 결과를 현재 화면에 적용하지 않는다.
   권한 상실 시 이전 주제·태그·입력을 숨기고 해당 작업을 취소하며 기본 채팅의 생명주기를 훼손하지 않는다.

#### 확정 작업 순서

| #   | 작업                               | 담당 역할  | Priority | 의존          | 상태                      |
| --- | ---------------------------------- | ---------- | -------- | ------------- | ------------------------- |
| 1   | 계약·데이터 연결                   | mobile     | 1        | 완료된 M7, M9 | COMPLETED                 |
| 2   | 주제·태그 화면과 대화 진입         | mobile     | 2        | 1             | COMPLETED                 |
| 3   | M9 동기화와 주제 재조회 연결       | mobile     | 3        | 1, 2          | COMPLETED                 |
| 4   | 자동 검증·독립 리뷰·양 플랫폼 수용 | qa, 사용자 | 4        | 1, 2, 3       | COMPLETED / USER_ACCEPTED |

담당은 역할 표기다. 구현과 최종 자동 검사는 coordinator가, 독립 정적 리뷰·수정 재리뷰는 별도
Claude QA context가 수행했다. 리뷰어는 테스트나 native 실행을 대신 수행하지 않았다.

- **1 — 계약·데이터:** T1-T7 runtime validator, mapper와 API adapter를 추가한다. 저장소·API는
  UI와 분리하고 auth/token을 중복 관리하지 않는다. 날짜·입력·권한·멱등 재시도·계정 격리와
  기존 row 보존을 focused test로 확인한다. Generated file은 generator로만 갱신한다.
- **2 — 화면:** 기본 주제 진입을 보존하면서 날짜별 목록·더 보기·생성·상세·작성자 편집·태그 편집을
  연결한다. 로딩·빈 목록·오류·재시도, 한글 입력·명시적 저장, 접근성 이름과 테마를 확인한다.
  생성된 서버 `chatroom_id`로 기존 채팅을 열고 그룹/계정 전환 시 stale navigation을 막는다.
- **3 — 동기화:** 신규 방 발견, `group_topics` 재조회, 중복 event와 실패 후 복구를 연결한다.
  Fake transport와 실제 SQLite test에서 WS/delta 중복·오래된 응답·재시작·복구 중 새 event를 확인한다.
  M9의 checkpoint, 메시지 dedupe, outbox와 account lifecycle 회귀를 유지한다.
- **4 — 최종 확인:** 앞선 작업의 focused test와 기존 전체 quality/contract 검사를 확인하고 독립 리뷰를
  수행한다. 리뷰 수정은 해당 작업 범위로 되돌린다. 이후 승인된 iOS·Android 실행에서 아래 네 항목을
  사용자에게 확인받고 자동 검사·에이전트 관찰·사용자 확인을 나눠 종료 기록한다.

수정 범위는 app의 계약 adapter/validator·계정 DB, 주제 feature·얇은 route, 필요한 기존 group/chat/sync
접점과 대응 테스트·품질 inventory·문서다. 검증 정책은 새 실제 경로를 반영할 때만 최소 변경하고
범위 제한이나 coverage 기준을 완화하지 않는다. Server, homelab, legacy PWA는 읽기 전용이며
패키지·native 설정 변경은 기본 계획에 포함하지 않는다.

#### 완료 조건과 사용자 수용

- [x] T1-T7 계약 검사와 날짜·입력·권한·멱등·pagination·mapper focused 회귀 통과
- [x] 계정 저장소 migration/격리, `group_topics` 재시도·중복·checkpoint 및 관련 M7-M9 focused 회귀 통과
- [x] 기존 `bun run check:code`, server/bootstrap contract 검사와 독립 리뷰 완료; coverage 80% 기준 유지
- [x] 양 플랫폼에서 아래 네 사용자 수용 항목 확인, 결과 출처를 구분해 기록
- [x] 사용자 M10 종료 승인; 구현 완료와 앱 전체 출시 판정을 구분

| 사용자 확인 항목                                                                            | iOS  | Android |
| ------------------------------------------------------------------------------------------- | ---- | ------- |
| 1. 기본 주제 접근을 유지하고 새 주제 생성 → 목록·상세 → 해당 주제 대화·송수신               | PASS | PASS    |
| 2. 서울 날짜별 조회·더 보기와 제목/본문·태그 저장·재조회, 작성자/소유자/일반 멤버 권한 차이 | PASS | PASS    |
| 3. 다른 계정이 만든 새 주제 발견, 백그라운드·네트워크 복귀 후 목록 복구와 중복 없음         | PASS | PASS    |
| 4. 그룹·계정 전환 및 재로그인 후 이전 주제·태그·편집 입력·늦은 결과 격리                    | PASS | PASS    |

실제 provider 로그인과 실서버 데이터 변경은 사용자가 승인한 계정으로 확인하며, 테스트 데이터 삭제는
별도 승인 없이 수행하지 않는다. Native 입력이 바뀌면 기존 clean prebuild와 양 플랫폼 재빌드 규칙을
적용하고, 바뀌지 않았다면 기존 Development Build를 사용할 수 있다. 구체적인 명령과 기록 경계는
[개발 검증 절차](development-workflow.md)를 따른다. 위 PASS는 2026-09-10 사용자가
“양 플랫폼에서 모두 확인했어. 제대로 작동해. M10 종료하고 커밋해”라고 보고·승인한 결과다.
플랫폼별 상세 trace를 별도로 받은 것은 아니며 자동 E2E 결과로 확대하지 않는다.

#### 유지하는 제외 범위와 승인 기록

메시지별 상대방 읽음 표시와 주제별 안읽음 배지는 추가하지 않는다. 응답의 `unread` field를
계약대로 검증하더라도 이를 새 배지 기능으로 노출하지 않는다. 주제 삭제·본문 삭제·AI 태그 생성·
태그 검색 API·오프라인 주제 생성/편집 예약·새 WebSocket은 제외한다. 미디어는 M11, 알림·푸시는
M12, 프로필·계정 삭제는 M13 그대로이며 bootstrap 정리와 기존 출시 blocker도 이번 범위에 합치지 않는다.

| 날짜       | 결정                                                                    | 의미                                                                                    |
| ---------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 2026-09-10 | 사용자: 이 범위와 순서로 M10 계획을 문서에 확정                         | T1-T7 기반 네 단계와 제외 범위 승인; 구현·빌드·실계정 작업·SCM는 별도                   |
| 2026-09-10 | 사용자: 계획 승인할게. 구현 착수해                                      | 1-3 구현 및 관련 로컬 검사 진행; native/user 수용·종료·SCM는 미실행                     |
| 2026-09-10 | 사용자: 전체 coverage·독립 리뷰 → iOS·Android 실행 검증 진행해          | 전체 검사·독립 재리뷰 PASS, 기존 설치본으로 제한된 실행 관찰; 사용자 수용·종료·SCM 대기 |
| 2026-09-10 | 사용자: 양 플랫폼에서 모두 확인했어. 제대로 작동해. M10 종료하고 커밋해 | 네 사용자 수용 항목 양 플랫폼 PASS, M10 종료·로컬 커밋 승인; push·배포 미승인           |

구현은 T1-T7 adapter/validator, account v4 additive cache, 목록·생성·상세·편집 route와 M9 신호 연결이다.
캐시 갱신과 matching `group_topics` marker 해제는 한 transaction이며 저장 도중 취소도 rollback한다.
기존 메시지·outbox·checkpoint를 유지하고 생성 결과가 불명확하면 같은 key/payload로만 명시적 재시도한다.
구현 focused 회귀 46 suites / 573 tests 이후 최종 전체 검사는 76 suites / 902 tests로 통과했다.
Coverage는 statements 85.54%, branches 81.46%, functions 87.59%, lines 89.00%다. 독립 리뷰가 찾은
확정적 생성 거부 후 새 시도 차단을 수정했고, 서버 계약에 맞춰 본문 공백·줄바꿈 보존을 유지했다.
기존 iOS·Android 설치본에서 최신 번들의 세션 복원, 주제 목록·날짜 필터, 작성 화면·빈 제목 차단,
홈 화면에서 앱으로 복귀 후 목록 재조회를 관찰했다. 이 제한된 관찰에서 에이전트가 실서버 주제·태그·메시지를
생성하거나 수정하지 않았으며 실제 변경은 이후 사용자 수용과 구분한다.
구체적인 검사·한계는
[개발 검증 기록](development-workflow.md#m10-구현과-focused-검증--2026-09-10)을 따른다.
이후 양 플랫폼 사용자 수용 네 항목과 종료 승인을 받아 M10을 정식 종료한다.
[M10 evidence](evidence/M10.md)에 출처와 한계를 보존한다. 종료 작업은 문서·exact-path 품질 목록과
로컬 커밋까지이며 제품 테스트·native 실행·실계정 작업을 반복하지 않는다. 다음은 M11 계획 검토이고 구현은 미승인이다.

### M11. 미디어 업로드·첨부·접근

- 상태: `COMPLETED / USER_ACCEPTED` — 2026-09-16 사용자 수용 및 종료 기록 승인. 2026-09-15 expo-image·expo-video 포함 양 플랫폼 재빌드, 포스터 송수신·realtime 반영 검증 완료
- 선행: M8, M10
- 사용자 결과: 지원하는 media를 선택해 upload를 완료하고 contract가 허용하는 message/topic에
  연결하며, 이후 안전하게 열거나 내려받는다.
- 계약 범위: MD1-MD5, 기존 C4의 ordered `media_upload_id` 참조. 서버 snapshot은 그대로 소비한다.

승인된 구현 순서:

1. **계약·통신**: MD1 upload intent → credential-free PUT → MD2 finalize,
   MD3 주제 미디어 목록, MD4 짧은 접근 URL, MD5 307 다운로드를 typed port로 연결한다.
2. **선택·업로드**: system picker로 이미지·동영상, document picker로 기존 오디오 파일을
   선택한다. 승인된 형식 호환성 변환 후 실제 MIME·크기를 확인하고 foreground 업로드 진행·취소·재시도를 표시한다.
3. **메시지 연결**: 모든 첨부가 confirmed된 후 기존 account SQLite/outbox에 메시지와
   첨부 순서를 한 번에 저장한다. v005가 v004 데이터·lease·재시도 정보를 보존한다.
   C4 재시도는 동일 `client_msg_id`와 upload ID 순서를 재사용하며 파일을 다시 업로드하지 않는다.
4. **표시·주제 첨부**: 기존 첨부 placeholder를 이미지 표시와 OS 열기·공유/저장으로 바꾼다.
   주제에는 권한 있는 사용자의 이미지 첨부와 MD3 페이지 조회를 연결한다.
5. **후속 승인된 기본 영상 재생**: 송신 말풍선의 버튼 대비를 보정하고 MP4 첨부에 영상 카드·재생
   버튼을 표시한다. 앱 내 전체 화면에서 iOS/Android native player의 기본 재생·일시정지·탐색 컨트롤을 사용한다.
   별도 custom player UI나 오디오 재생 기능은 추가하지 않는다.

입력·수명주기 경계:

- 이미지 JPEG/PNG/WebP/GIF 최대 10 MiB, chat 동영상 MP4 최대 50 MiB,
  chat 오디오 WebM/MP4/Ogg 최대 15 MiB. 서버의 MIME·용량 제한은 변경하지 않는다.
- 사용자 후속 승인으로 HEIC/HEIF·AVIF·TIFF·BMP 등은 OS가 해독할 수 있을 때 Expo native 모듈로
  JPEG(quality 0.9)로 변환한다. 이 변환 입력은 로컬 파일·최대 50 MiB로 제한하고, 출력의 JPEG 헤더와
  실제 크기를 확인한 뒤 이미지 10 MiB 제한을 적용한다. 지원되는 JPEG/PNG/WebP/GIF는 그대로 유지한다.
- iOS 동영상은 MOV 등을 최대 1080p H.264/AAC MP4로 내보낸다. Android의 기존 picker 설정과 MP4
  경로는 유지하며, 공통 이미지 변환기는 양 플랫폼에서 사용한다. 모든 입력 형식의 해독을 보장하거나
  확장자/MIME만 바꾸지 않는다. OS 변환 실패·허용되지 않은 출력은 업로드 전에 거절한다.
- chat visual 첨부는 순서 있는 최대 4개. 오디오는 정확히 1개, 텍스트·다른 첨부와 혼합하지 않는다.
  길이는 MD2가 검사한 값만 사용하며 양수·최대 330초다. 주제 첨부는 이미지만 허용한다.
- canonical `media.id`와 `media_upload_id`를 구분한다. MD4/MD5에는 canonical ID만 사용한다.
- MD5의 API bearer 요청은 307에서 멈추고, `Location`은 별도의 credential-free 요청으로 받는다.
  configured HTTPS media origin을 확인한 뒤 signed URL 전체를 그대로 사용한다. URL·토큰은 DB/로그에 저장하지 않는다.
- 계정/대상 변경, 화면 이탈과 background에서 진행 중 전송을 취소하고 늦은 응답을 폐기한다.
  앱이 만든 임시 파일만 정리하며 선택 원본을 삭제하지 않는다. 원격 미완료 upload 삭제 API는
  계약에 없으므로 원격 삭제 완료라고 표시하지 않는다.
- 파일 선택·변환 중에는 진행 문구와 중복 선택 방지를 유지한다. Native 변환 자체의 즉시 중단을
  보장하지는 않으며, 완료 시 화면/계정이 유효하지 않으면 결과를 폐기하고 변환 임시 파일만 정리한다.
- 영상은 사용자가 재생을 눌렀을 때만 MD4 인증 후 기존 bounded GET으로 임시 MP4를 받는다.
  player에는 앱 소유 로컬 파일만 전달한다. 목록 자동재생·PiP·background 재생·외부 전송은 사용하지 않으며,
  닫기·화면/계정 변경·background에서 중단하고 native player 해제 뒤 파일을 정리한다.
- MD1은 멱등성을 보장하지 않는다. 특히 topic MD2 응답 유실은 이미 bind되었을 수 있어
  같은 upload ID finalize 재시도·MD3 재조회로 확인한다.

제외 범위: 녹음·카메라·일반 미디어 편집(위 형식 호환성 변환만 포함), 백그라운드/분할/재개 업로드, 앱 종료 후 미완료 업로드 복원,
새 큐·동기화 엔진·상태 관리 프레임워크, 자체 audio player·custom video player UI, 서버·homelab 변경,
M12/M13 선행 구현, 추가 읽음 기능과 bootstrap 정리.

완료 증거:

- focused 계약·policy·credential isolation·취소/재시도·SQLite upgrade 테스트와 type/lint.
- 별도 승인 후 전체 coverage·독립 리뷰, 양 플랫폼 clean prebuild·재빌드·설치.
- iOS·Android에서 Expo transport의 no-follow/credential isolation 실제 동작과
  picker → upload → 송수신/주제 첨부 → 접근/저장, 취소·실패 복구를 확인한다.
- 사용자 수용 후 종료·커밋은 별도 요청으로 진행한다. 현재 결과는 [M11 evidence](evidence/M11.md)에 기록한다.

2026-09-11 실행에서 Expo File PUT의 Content-Type 덮어쓰기와 전체 JS buffering을 발견했고,
사용자 승인 후 파일 PUT 전용의 작은 native 모듈로 교체했다. 서버 계약·기존 구조·다운로드는 유지했다.
양 플랫폼에서 정확한 MIME·50 MiB 파일·credential isolation·redirect 금지·취소를 합성 endpoint로 확인했다.
이후 2026-09-15 재빌드와 포스터·realtime 반영 검증을 거쳐 2026-09-16 M11을 종료했다. 상세는 [M11 evidence](evidence/M11.md)에 기록한다.

이후 사용자가 iOS HEIC/MOV 거절을 보고하고 “ios 네이티브를 지원하도록 수정해줘. 최대한 모든
플랫폼에 호환되도록”을 승인했다. 앱에 Expo SDK 57용 이미지 변환 모듈을 추가하고 iOS 영상 내보내기를
연결했다. 2026-09-14 양 플랫폼 clean prebuild·재빌드·설치를 마쳤고 사용자는 송수신 성공과 영상 재생
불가를 보고했다. 당시 화면에는 native video player가 없었다. 후속 승인으로 `expo-video`를 추가했으며,
이 새 의존성의 재빌드·실제 재생 확인은 이전 형식 호환성 빌드나 자동 테스트로 대체하지 않는다.

### M12. 알림함과 Expo 푸시

- 상태: `COMPLETED / USER_ACCEPTED` — 2026-09-21 iPhone 실기기 푸시 수신·탭 handoff·미리보기 off·기본
  대화방 알림 확인 및 사용자 종료 승인. 2026-09-16 자동 검사·독립 리뷰 PASS
- 선행: M6, M7, M10
- 사용자 결과: Notification history를 읽고 read 처리하며, 동의한 device에서 받은 push로 올바른
  authenticated destination에 진입한다.
- 계약 범위: Notification history와 Push installation

핵심 작업 (구현 완료):

- Structured notification `type`과 `args`를 local copy로 안전하게 rendering (raw args 미노출)
- Read state(N2 markRead, optimistic + 실패 rollback)와 destination authorization/revalidation
  (N1 그룹·채팅방 스캔, 403/404 → unauthorized/not_found)
- Expo token register(P2)/update(P3, 토큰 회전·메시지 미리보기 토글)/delete(P4)와
  login/logout/account/device lifecycle(device-scoped `installation_id`, 계정 전환 시 P4→P2 순서)
- Permission denied/missing_project_id/not_physical_device degrade, stale installation 1회
  자동 재등록과 `stale_unrecoverable` cleanup
- Push tap handoff: warm/background listener·cold-start 1회 체크, `notification_id` dedupe,
  인증 준비 이후에만 라우팅

완료 증거 (자동 검사):

- `bun run check:code`: 145 suites / 1,573 tests PASS, coverage statements/branches/functions/lines
  87.37% / 82.48% / 88.31% / 90.22%, `check-architecture` PASS(0 violations)
- 신규 notification/push 테스트 16개 파일과 코디네이터 보강 회귀 테스트 3건
- 독립 리뷰 3건(Alignment/Safety/Regression) 전부 PASS, CRITICAL/HIGH 0건
- 상세는 [M12 evidence](evidence/M12.md), 아키텍처 결정은 [ADR 0007](adr/0007-push-installation-device-scope.md)

실기기 증거 (완료):

- 2026-09-20 사용자 승인으로 clean prebuild + `expo run:android`(에뮬레이터, Play 이미지) +
  `expo run:ios`(시뮬레이터) + `expo run:ios --device <device-name>`(iPhone 15 Pro) 재빌드·설치.
- Android 에뮬레이터: 알림함 실데이터, 탭 → 대화방 이동, 권한 프롬프트, 실제 Expo 토큰 발급·P2
  등록 확인. 에뮬레이터에서 드러난 Android 13+ 권한 매핑과 토큰 회전 루프 결함을 수정.
- iPhone 실기기: 등록, 백그라운드·포그라운드 수신, warm/cold 탭 → 대화방 직행, 미리보기 off
  배너("새 메시지 / 새 메시지가 도착했습니다."), 기본 주제 대화방 알림, 로그아웃 후 미수신까지
  사용자가 확인. 실기기에서 드러난 두 서버 결함(data-only 페이로드, 기본 대화방 알림 부재)은
  jamye-server PR #6·#7로 수정·배포했다.
- 2026-09-21 사용자 종료 승인.

### M13. 프로필 수정과 계정 삭제

- 상태: `COMPLETED / USER_ACCEPTED` — 2026-09-22 사용자가 디바이스 확인 전부 완료를 보고하고 종료
  승인. 2026-09-21 A1-A3 구현, 2026-09-22 격리 리뷰 12건 반영 후 전체 자동 검사 PASS(151 suites /
  1,658 tests, coverage statements/branches/functions/lines 87.63% / 82.63% / 88.66% / 90.43%,
  `check-architecture` PASS 0 violations). 파괴적 로컬 정리(SQLite 파일·미디어 캐시 물리 삭제)는
  범위 밖이며 별도 명시 승인 대상으로 유지.
- 선행: M6
- 사용자 결과: Profile을 갱신하고 account 삭제를 안전하게 요청하며, 삭제된 identity가 active
  local session이나 stale data로 남지 않는다.
- 계약 범위: Profile update와 account deletion

핵심 작업 (구현 완료):

- U2 `PATCH /api/v1/me` 닉네임 편집: `nickname-section.tsx`의 inline 편집 폼(1..64자/trim/non-empty
  client-side validation) → `account-lifecycle.updateNickname` → `session.applyProfile`을 통한
  persisted identity refresh(표시값은 `session.state.profile`에서만 파생, 로컬 컴포넌트 state 아님)
- U3 `DELETE /api/v1/me` 계정 삭제: `delete-account-section.tsx`의 destructive `Alert.alert` confirm
  → `pushDisable.disable()`(best-effort, 토큰이 유효할 때 먼저 실행) → `authorizedRequest`(DELETE)
  → 성공(204) 시에만 `session.logout()`(blocked/error에서는 세션·토큰 불변)
- 409 `group_ownership_transfer_required` 차단을 일반 오류와 구분된 결과(`'blocked'` vs `'error'`)로
  분리하고, 각각 재시도 가능한 안내를 렌더
- `updateNickname`/`deleteAccount` 상호 배제를 위한 공유 in-flight guard
- Reactivation-safety 회귀 테스트(삭제된 계정의 stale refresh 401 이후 이전 profile 재발행 없음)
- `session.logout()` 이후 `AccountScopeController`·notifications store의 principal-loss cleanup 확인
  (groups/chat/topics store는 기존 remount-on-key 패턴 코드 리딩으로 확인, 전용 통합 테스트는 groups
  store에 한해 미작성 — 테스트 커버리지 갭으로 명시)
- 공용 HTTP boilerplate를 `src/core/http/http-requester.ts`로 승격(`notifications-http.ts`는 thin
  re-export로 전환, 세 번째 `request()` 구현 없음)
- 아직 구현하지 않은 media/push milestone을 account update/delete의 선행 조건으로 요구하지 않음(실제
  구현: 위 principal-loss cleanup 확인이 실제 구현된 M11/M12 scope만 대상으로 함)

완료 증거 (자동 검사):

- `bun run check:code`: 151 suites / 1,658 tests PASS, coverage statements/branches/functions/lines
  87.63% / 82.63% / 88.66% / 90.43%, `check-architecture` PASS(0 violations)
- 신규 테스트 6개 파일(account 5 + `tests/core/http/http-requester.test.ts` 특성화 1)과
  auth-controller/session-provider/app-providers/account-screen 기존 스위트 확장
- 2026-09-22 VERIFY/REFINE 격리 리뷰(Alignment/Safety/Regression/Reusability/Consistency) 지적
  사항 반영 후 게이트 재통과: UI settle `.catch`·unmount 가드, 세션 콜백 identity 안정화,
  provider 표시 복원, 닉네임 길이 상수 단일화
- 상세는 [M13 evidence](evidence/M13.md), 아키텍처 결정은 [ADR 0008](adr/0008-account-lifecycle-placement.md)

미검증 / 별도 승인 필요:

- 실제 account 삭제 E2E와 destructive local cleanup은 각각 별도 명시 승인 필요(둘 다 미실행)
- iOS/Android 디바이스 실행 검증과 사용자 종료 승인: 2026-09-22 충족(표는 [M13 evidence](evidence/M13.md) 참고)

### M14. UI/UX 다듬기 (반복 라운드)

- 상태: `COMPLETED / USER_ACCEPTED` — 2026-09-28 사용자가 라운드 2의 마지막 수정(R4)을 확인하고
  M14 종료를 승인했다. 경과: 2026-09-22 사용자가 계획을 승인하고 라운드 1 착수를 지시; 2026-09-26 세션
  `20260926-181036`에서 그룹 목록·그룹 상세·주제 목록·주제 상세를 native-first 범위로 확장하고,
  서버 배포 뒤 양 플랫폼 기기 검증과 결함 수정을 기록했다([M14 evidence](evidence/M14.md)).
  2026-09-27 사용자가 라운드 1 범위 종료를 선언했다("그룹 목록, 그룹 상세, 주제 목록, 주제 상세까지
  전부 잘 마무리"). 2026-09-27 라운드 2(세션 `20260927-120934`)를 시작해 2026-09-28 마쳤다.
- 선행: M13(모든 제품 화면이 존재하는 상태)
- 결정(2026-09-22): [ADR 0005](adr/0005-native-ui-toolkit-adoption.md)의 native-first 방향(`@expo/ui`, `expo-symbols`, `PlatformColor`, native Stack header)을 유지하되, D3(tab bar 없음)는 라운드 1에서 [ADR 0009](adr/0009-tab-bar-navigation.md)로 대체한다.
  종료 기준은 사용자의 만족 선언이며 라운드 수를 미리 정하지 않는다. 라운드 사이의 사용자 리뷰
  대기 시간에는 M15-M17을 병행할 수 있다.
- 사용자 결과: 스타일, 페이지 네비게이션, 페이지 라우팅 전반이 사용자 취향에 맞는다.
- 계약 범위: 2026-09-22 초기 라운드는 app-only였지만, 2026-09-26 확장 범위는 서버의 App Links,
  대화방 미디어 갤러리 API(C5), topic media 제거(MD3 제거)를 포함한다. 서버 변경은 jamye-server main
  `5b987a2`로 운영 배포됐다.

라운드 구조(모든 라운드 동일):

1. 사용자 지적과 취향을 양 플랫폼 스크린샷 또는 실기기 기준으로 수집한다.
2. 그 라운드의 변경 범위(화면·컴포넌트·route 목록)를 고정하고 사용자 승인을 받는다.
3. 구현한다.
4. `bun run check:code`를 통과시키고 양 플랫폼(iOS Simulator·Android Emulator, 필요 시 실기기)에서
   실행을 확인한다.
5. 사용자가 리뷰한다. 만족을 선언하면 M14를 종료하고, 아니면 다음 라운드로 간다.

다듬기 영역(초기 목록, 라운드마다 갱신):

- 스타일: 플랫폼 고유 시각 언어([ADR 0010](adr/0010-platform-native-visual-language.md): iOS는 Liquid
  Glass 네이티브 chrome, Android는 Material 3 기본), 색 체계([ADR 0011](adr/0011-color-system-platform-neutral-berry-highlight.md):
  플랫폼 중립색 + Berry highlight, Android Berry 시드 팔레트), [DESIGN.md](../DESIGN.md) 토큰(색·타이포·spacing·radius)과
  실제 화면의 일치, 라이트/다크, Android API 34 미만 fallback, 200% 텍스트·reduce motion.
- 페이지 네비게이션: tab bar 동선(그룹/알림/계정 탭, ADR 0009)과 루트 Stack의 대화·모달, large title·back, modal presentation(그룹 생성·초대 참여·새 주제), 알림 탭 → 대화방 handoff.
- 페이지 라우팅: `src/app` 13개 route의 계층 재정리(`groups/[groupId]` ↔ `chatrooms`/`topics`),
  `index.tsx`의 `appMode` 분기(local-fixture / connected-auth; mode는 M17 (B)에서 제거), deep link·`+native-intent.tsx` 규칙,
  로그인 전후 redirect.
- 상태 화면: loading/empty/error/retry, 삭제된 콘텐츠 placeholder(M15와 연계).

규칙:

- native-affecting 변경(새 native module, 아이콘·스플래시 등)만 clean prebuild와 양 플랫폼 rebuild를
  요구한다.
- ADR 0005 D3(tab bar 없음) 등 ADR 결정을 바꾸는 라운드는 ADR 갱신과 사용자 승인을 먼저 받는다.
- 라운드 종료 시 DESIGN.md를 실제 화면에 맞게 갱신한다.
- 라운드별 evidence는 `docs/evidence/` 아래 M14 전용 evidence 파일에 라운드 번호로 누적한다. 이 파일은 라운드 1 착수 시
  만들고 `tools/quality/check-architecture.cjs`의 exact-path 목록에 등록한다.

완료 증거:

- 라운드별 변경 목록, 양 플랫폼 스크린샷, 자동 검사 결과
- 최종 사용자 만족 선언 기록

미검증 / 별도 승인 필요:

- M14 종료 조건인 사용자 만족 선언: 2026-09-28 충족(아래 라운드 2의 종료 항목).
- release variant, App Store / Play Store 등록, Play signing key 추가와 store URL 채우기는 M18 범위다.

#### 라운드 1 범위 (2026-09-22 고정)

- 결정(2026-09-22): 영역은 네비게이션 구조와 라우팅·화면 계층 정리로 한정하고, 스타일과 상태 화면은 이번 라운드에서 제외한다. tab bar를 도입한다([ADR 0009](adr/0009-tab-bar-navigation.md), ADR 0005 D3 대체). 크기는 작게(화면 3개)다. 범위 근거는 정적 코드 감사 기반 제안이며 사용자가 항목 A·B·C를 선택했다.
- 상태: 종료 — 범위 고정 후 2026-09-22 착수 승인, 2026-09-26 네 화면으로 확장(아래 "라운드 1 확장 기록"), 2026-09-27 사용자가 라운드 1 범위 종료를 선언했다. 실행 tracker는 로컬 전용 파일(gitignore 대상인 docs/plans 아래 004-m14-ui-ux-round-1)이다.
- 선행: [ADR 0009](adr/0009-tab-bar-navigation.md)(Accepted, ADR 0005 D3 대체) 반영. 이 ADR 없이는 라운드 1 구현에 착수할 수 없다.
- 사용자 리뷰 1(2026-09-22) 반영: tab bar는 expo-router `NativeTabs`, 헤더 버튼은 iOS native toolbar(`Stack.Toolbar`)·Android Material icon button으로 바꿨다. 상시 규칙은 [ADR 0010](adr/0010-platform-native-visual-language.md).
- 사용자 리뷰 2·3(2026-09-22) 반영: `+`는 버튼 아래 native 메뉴(bottom sheet 제거). 색은 플랫폼 중립색 위에 Berry를 highlight로만 쓰고 Android는 Berry 시드 Material 3 팔레트로 고정한다([ADR 0011](adr/0011-color-system-platform-neutral-berry-highlight.md)).
- 사용자 리뷰 4(2026-09-22, 그룹 홈) 반영: 그룹 홈은 regular title, 헤더는 새 주제·그룹 대화방·그룹 정보 순, 기본 주제 대화 행과 서울 날짜 캡션 제거, 주제 행은 스와이프 카드(탭 = 대화방, 스와이프 = 상세). 날짜 가로 다이얼은 조사 결과를 라운드 2 후보로 기록.
- 사용자 리뷰 5(2026-09-22) 반영: iOS 헤더 다크 모드 버그(react-navigation theme이 라이트 고정)를 `resolveNavigationTheme`로 수정, 주제 목록은 iOS SwiftUI `List` + `SwipeActions` / Android RNGH 카드로 분기(Compose 대응 `SwipeToDismissBox`는 `@expo/ui` 57 미노출), 날짜 가로 다이얼 구현(초기 오늘, 전체 날짜·이전 날짜 더 보기 없음, 스와이프로만 결정).
- 사용자 리뷰 6(2026-09-22) 반영: iOS 목록의 빈 상태 오표시 수정, 스와이프 액션을 상세·삭제 2개로(삭제는 M15 T8 `DELETE …/topics/{topic_id}` 계약 intake 뒤 핸들러 연결 시 노출), 다이얼에 탭 선택 추가(SegmentedControl 드롭인은 세그먼트 4~5개 한계로 미채택).
- 사용자 리뷰 7(2026-09-22) 반영: 그룹 정보 진입은 top bar 그룹명 버튼(`HeaderTitleButton`)으로, 헤더 액션은 그룹 대화방 → 새 주제 순. 리뷰 4~6은 0264bce·f3f0bb4로 커밋.
- 사용자 리뷰 8(2026-09-22) 반영: 그룹 목록 본문을 `@expo/ui` universal `List`/`ListItem`/`Text`/`Icon`/`Column`/`Button`으로 전부 교체(native pull-to-refresh 포함). 리뷰 7은 f5518aa로 커밋.
- 사용자 리뷰 9(2026-09-22) 반영: 로딩 행 제거, Android 당겨서 새로고침이 빈 영역에서 안 되던 원인(universal `List`가 내용 높이만 차지)을 `fillMaxSize` Compose 컨테이너로 수정.
- 사용자 리뷰 10(2026-09-22) 반영: Android 주제 목록의 당겨서 새로고침을 Compose `PullToRefreshBox` + `RNHostView`로 옮겨 그룹 목록과 같은 Material 3 인디케이터로 통일(RN `RefreshControl` 제거).
- 사용자 리뷰 11(2026-09-22) 반영: 공용 `NativeList`·`ActionListItem`(iOS 스와이프+컨텍스트 메뉴 / Android 길게 누르기+⋮ 드롭다운)으로 그룹·주제 목록 통일. 그룹 행 액션 = 초대 코드 발급·소유권 이전(소유자) / 그룹 나가기. Android 스와이프 삭제 전용 모듈은 M15 이후 후보.
- 사용자 리뷰 12(2026-09-22) 반영: 그룹 목록을 regular title로 전환(iOS에서 제목과 `+`가 한 줄).

항목:

- **A. 3탭 Tab bar**: expo-router `(tabs)` 그룹으로 그룹 / 알림 / 계정 탭을 도입한다. 탭 구조, 헤더 아이콘·배지 제거, 대화·모달의 루트 Stack 배치, 알림 탭 badge 연결의 세부 규칙은 [ADR 0009](adr/0009-tab-bar-navigation.md) D1-D3을 따른다.
- **B. 그룹 홈 재구성**: `groups/[groupId]`를 주제 목록 화면(현 TopicsScreen: 기본 대화 행, 날짜 칩, 주제 목록, 새 주제 버튼)으로 바꾸고 제목을 그룹 이름으로 한다. 멤버·초대·이름 변경·소유권 이전·나가기/삭제(현 GroupDetailScreen)는 `groups/[groupId]/info`(그룹 정보)로 옮기고 그룹 홈 헤더의 정보 버튼으로 진입한다. 깊이는 그룹 목록 → 그룹 홈 → 주제 상세 → 대화의 3단계가 되고, 기본 대화는 그룹 홈에서 한 번에 연다.
- **C. 라우트 경로 정리**: 주제 목록을 렌더링하던 `groups/[groupId]/chatrooms/index.tsx`를 제거한다(그룹 홈이 흡수). 대화 `groups/[groupId]/chatrooms/[chatroomId]`와 주제 `groups/[groupId]/topics/{new,[topicId]}` 경로는 유지한다. 앱 코드의 push/replace 경로, 푸시 탭 handoff, 딥링크 경로표를 갱신하고 `+native-intent`는 바꾸지 않는다.

화면: 그룹 목록, 그룹 홈, 그룹 정보(3개)와 루트/탭 레이아웃. 알림·계정 화면은 탭으로 옮기기만 하고 내용은 바꾸지 않는다.

목표 라우트 맵(구현 시 파일 배치 세부는 조정할 수 있다):

| 이전                                                             | 이후                                           | 비고                                  |
| ---------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------- |
| `/` (index: 로그인 또는 그룹 목록)                               | `/` → 로그인 화면 또는 `(tabs)` 진입           | 인증 게이트 분리(D)는 라운드 2        |
| `/notifications` (헤더 아이콘)                                   | `(tabs)/notifications` 탭                      | 미읽음 badge                          |
| `/account` (헤더 아이콘)                                         | `(tabs)/account` 탭                            | 화면 내용 변경 없음                   |
| `/groups/[groupId]` (멤버·관리 + 주제 행)                        | `(tabs)/groups/[groupId]` = 그룹 홈(주제 목록) | 제목은 그룹 이름, 헤더에 정보·새 주제 |
| `/groups/[groupId]/chatrooms` (주제 목록)                        | 제거                                           | 그룹 홈이 흡수                        |
| (없음)                                                           | `(tabs)/groups/[groupId]/info` = 그룹 정보     | 현 GroupDetailScreen                  |
| `/groups/[groupId]/topics/[topicId]`                             | 그룹 탭 내부 Stack 유지                        |                                       |
| `/groups/[groupId]/chatrooms/[chatroomId]`                       | 루트 Stack 유지                                | tab bar 숨김                          |
| `/groups/create`, `/groups/join`, `/groups/[groupId]/topics/new` | 루트 Stack 모달 유지                           |                                       |
| `/oauth/[provider]`                                              | 변경 없음                                      |                                       |

영향 코드(착수 시 확정): `src/app/_layout.tsx`, `src/app/index.tsx`, 신규 `(tabs)` 레이아웃 파일 2개(탭 루트 `_layout.tsx`, groups 스택 `_layout.tsx`), route 파일 이동·삭제, `group-list-screen.tsx`, `group-detail-screen.tsx`, `topics-screen.tsx`, `use-topic-screen.ts`, `group-form-screen.tsx`, 알림 badge 연결, 라우트를 참조하는 테스트, `tools/quality/check-architecture.cjs`의 경로 목록, `docs/product-intent.md` 7.1절 route 인벤토리, DESIGN.md 4절의 tab bar 규칙, ADR 0005 D3 → ADR 0009 대체. native rebuild 여부는 위 '미검증 / 별도 승인 필요' 항목을 따른다.

라운드 1 완료 조건:

- `bun run check:code` PASS(기존 coverage 기준 유지)와 라우트·푸시 handoff 회귀 테스트 갱신
- iOS Simulator·Android Emulator에서 탭 전환, 그룹 목록 → 그룹 홈 → 기본 대화/주제 상세 → 대화, 알림 탭 → 대화 handoff, 계정 탭 로그아웃 확인
- 사용자 리뷰. 만족이면 M14 종료, 아니면 라운드 2 지적 기록. evidence는 `docs/evidence/` 아래 M14 파일에 라운드 1로 기록(착수 시 생성·checker 등록)

#### 라운드 1 확장 기록 (세션 20260926-181036)

- SSOT: jamye-server `.agents/results/requirements-20260926-181036.md`의 L5, E3, E5, E7, A1,
  §4와 plan `task-docs-app`.
- 범위: 그룹 목록, 그룹 상세(그룹 정보), 주제 목록(그룹 홈), 주제 상세. 네 화면은 iOS HIG/Liquid
  Glass와 Android Material 3를 우선하고, 컴포넌트 선택 순서는 `@expo/ui` universal →
  `@expo/ui/swift-ui` / `@expo/ui/jetpack-compose` 플랫폼 파일 → 로컬 `jamye-ui` Expo module이다.
- 서버 선행 변경: jamye-server main `5b987a2`가 운영 배포됐다. 포함 범위는 C5 대화방 미디어 API,
  public App Links(AASA·assetlinks·`/invite/{code}`), MD3 topic media 제거다. 운영 smoke는 AASA,
  assetlinks, `/invite/{code}` 보안 header·CSP, C5 401, MD3 404를 확인했다.
- 앱 링크 계약: `https://jamye-api.ridewithmin.com/invite/{code}`와 `jamye://invite/{code}`는
  `+native-intent` → memory-only `pendingInviteStore` → 코드 없는 `/groups/join`으로 이어진다. 자동
  가입은 없고 사용자가 `가입`을 눌러야 한다([ADR 0012](adr/0012-invite-links-public-link-contract.md)).
- 로컬 native module: `jamye-ui`는 iOS `JamyeAvatarView`(SwiftUI `AsyncImage` + monogram fallback)와
  Android `JamyeDateChipRowView`(reverse-layout `LazyRow` + M3 `FilterChip`)만 제공한다
  ([ADR 0013](adr/0013-jamye-ui-local-native-module.md)).
- 기기 검증과 결함 수정: Android dev client와 iOS 시뮬레이터에서 네 화면, C3 입력 화면, 초대 링크,
  주제 대화방 갤러리, 대화방 헤더 흐름을 확인했다. 상세 스크린샷 경로와 결함 12건의 원인·수정·회귀
  테스트는 [M14 evidence](evidence/M14.md)의 "라운드 1 (세션 20260926-181036)" 절에 누적한다.

라운드 2 또는 이후 후보:

- 아바타 변경(계정 화면 업로드 + 공개 URL) — M17 라운드 3 (B)에서 구현(서버 task-19).
- haptics(날짜 선택 tick 등).
- Android swipe-to-delete 모듈과 주제 삭제 UX(M15).
- 그룹 기본 대화방 갤러리.
- 알림 목적지(E5): `new_topic` push·알림함 목적지는 현재 주제 상세 URL 그대로다. 목록 → 대화방 → 주제
  상세 흐름과 맞출지 라운드 2에서 재검토한다.
- 알림·계정 화면, 채팅 본문 UI, 로그인 화면 재설계 — 라운드 2(세션 20260927-120934)에서 로그인·
  계정·알림함·대화방(그룹·주제) 전체를 네이티브 UI로 구현하고 기기 검증했다(아래 "라운드 2" 절,
  [M14 evidence](evidence/M14.md)).
- Android carousel `maskClip` 미노출로 중·소 항목이 사각으로 잘리는 문제.
- 3열 grid 타일 모양(사진 앱 관례의 사각)과 서버 썸네일 도입.
- iOS 그룹 정보의 `멤버`·`관리` 섹션 헤더.
- iOS toolbar 강조 버튼(가입·만들기) tint.
- 서버 공지 메시지의 markdown 링크 렌더링과 앱 경로 정리.
- 그룹 목록을 거치지 않고 그룹 홈에 들어올 때 제목이 `그룹`으로 남는 문제.
- 로컬 모드 DB(`jamye.db`) 쓰기 직렬화 적용 여부 — 로컬 모드를 M17 (B)에서 제거해 해당 없음.
- 아바타 URL 신뢰 경계: 라운드 2 서버 배포 전의 `PATCH /users/me`는 `avatar_url`을 길이(512자 이하)만
  보고 받았다. 앱은 절대 웹 URL만 불러오고 `http:`는 `https:`로 올리지만(`src/shared/ui/avatar.shared.ts`),
  다른 멤버가 넣은 URL을 불러오면 보는 사람의 IP와 조회 시점이 그 host에 드러난다. 아바타 변경(업로드 +
  공개 URL)과 함께 서버 검증이나 업로드 기반 URL로 바꾸고, 같은 작업에서 Kakao 로그인 profile 요청에
  `secure_resource=true`를 넣고 이미 저장된 `http://` Kakao URL을 정리하기로 했다(서버 변경·재배포
  필요). 라운드 2 서버 배포로 해결: S3(https 절대 URL만 허용, `secure_resource=true`)·S4(migration 0013으로
  저장된 `http://` 값을 `https://`로 일괄 변환), PR #9 → `a77cac5`(2026-09-27). 지금 서버 규칙은 https
  URL, 512자 이하이고 `""`는 지우기다. 업로드 기반 URL은 M17 라운드 3 (B)의 서버 task-19로 추가했다.
- 주제 태그 권한 맞추기: 앱은 2026-09-27 사용자 결정으로 주제 편집(제목·본문·태그)을 작성자만 한다. 서버 T6
  태그 교체 API는 아직 작성자 또는 그룹 소유자를 허용하므로, 서버 권한도 작성자만으로 맞출지 정한다(서버 변경·재배포 필요).
  라운드 2 서버 배포로 해결: S2(작성자만 허용, 비작성자는 403 `topic_author_required`), PR #9 →
  `a77cac5`(2026-09-27).
- 의존성 정리: `bun audit`가 Metro 경유 transitive `image-size`(>=1.2.0 <=2.0.2)의 high advisory 2건
  (GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr, 무한 루프 DoS)을 보고한다. 빌드 도구 경로에만 있고 앱
  번들에는 없다. upstream 갱신이나 `overrides`로 정리한다.
- release variant / 스토어 등록 / Play signing key 추가 / store URL 값 채우기(M18).
- 서버 task-14(soft delete), task-15(Apple 로그인), task-16 잔여 백로그.
- 2026-09-22 라운드 1에서 넘어온 후보(아직 유효): D. 인증 게이트 라우팅 분리(`(auth)/sign-in` +
  Redirect; local-fixture 모드 별도 라우트는 M17 (B)에서 모드 제거로 해당 없음); 계정 화면의 '로컬 계정 저장소'·'서버 연결 진단' 섹션을
  개발자 전용으로 정리; 이번 네 화면 밖의 스타일·컴포넌트와 상태 화면(loading/empty/error); 미디어 뷰어
  오버레이·채팅 composer의 Liquid Glass 적용 여부(ADR 0010 D2). 채팅 화면 제목(D7·E11), 날짜 다이얼
  haptic(위 haptics), Android 주제 행 스와이프(위 M15)는 이번 세션에서 처리했거나 위 항목으로 옮겼다.
  위 항목 중 개발자 전용 계정 섹션 정리(A3)와 composer/미디어 뷰어의 Liquid Glass 적용(W1, R3)은
  라운드 2(세션 20260927-120934)에서 구현했다. 인증 게이트 라우팅 분리(`(auth)/sign-in`)는 이번에도
  범위 밖으로 유지했다.

#### 라운드 2 (세션 20260927-120934) — 로그인·계정·알림·대화방 네이티브 UI, 사진·동영상·음성

- SSOT: jamye-server `.agents/results/requirements-20260927-120934.md`(L1-L3, A1-A4, N1-N4, R1-R4,
  W1-W4, V1-V4, S1-S5, E1-E15), 계획 `.agents/results/plan-20260927-120934.json`.
- 범위: 로그인, 계정, 알림함, 대화방(그룹 기본 대화방과 주제 대화방 모두) — 메시지 목록·말풍선
  무리·길게 눌러 메시지 메뉴·전체 화면 미디어 뷰어, 입력창(`+`·텍스트 필드·마이크/보내기), 사진·
  동영상 다중 첨부, 대화방 안 음성 녹음·전송·재생. iOS는 Liquid Glass·HIG, Android는 Material
  3(Berry seed)를 우선했다(ADR 0010, ADR 0011).
- 새 native 의존성(재빌드 승인): `expo-audio`(녹음·재생), `expo-haptics`(iOS 녹음 시작·정지·전송
  햅틱), `expo-clipboard`(메시지 메뉴 `복사`). 마이크 권한 문구는
  `대화방에서 음성 메시지를 녹음하기 위해 마이크를 사용합니다.`다
  ([ADR 0014](adr/0014-voice-messages-and-microphone-permission.md)). 기존 파일 기반 음성 첨부
  (`음성 파일 첨부`, `audio-file-picker.ts`)와 `expo-document-picker` 의존성은 제거했다(의존성은
  2026-09-28 제거, 이미 설치된 dev client의 native 모듈은 다음 재빌드 때 빠진다).
- 서버 선행·동반 변경(jamye-server, 이번 세션 배포): S1 알림 args에 그룹 이름·주제 제목 보강(계약
  변경 없음), S2 주제 태그 교체(T6) 권한을 작성자만으로 축소, S3 프로필 사진 URL을 절대 https만
  허용하고 카카오 조회에 `secure_resource=true`를 추가, S4 migration
  `0013_https_avatar_urls.sql`로 저장된 `http://` 프로필 사진 URL을 `https://`로 일괄 변환. 커밋
  `d5167c3` → PR #9 → merge `a77cac5` → homelab 배포(2026-09-27 06:42:46Z).
- 서버 후속 배포(2026-09-28): 기기 검증 중 발견한 HTTP 전송 첨부 1개 제한(첨부 2개 이상이 422
  `media_not_available`로 거부됨)을 해제해, 계약이 이미 지원하던 최대 4개까지 받도록 수정. 커밋
  `9a6cba1`+`fd07187` → PR #10 → merge `c7f71a8` → homelab 배포. 상세는 jamye-server
  `.agents/results/deploy-20260927-120934.md` §10.
- 기기 검증과 결함 수정: iOS 시뮬레이터(iPhone 17 Pro)와 Android
  에뮬레이터(`jamye_pixel_9_api_36`)에서 배포된 운영 서버 기준으로 검증했다. 발견한 결함 24건(Host
  밖 렌더, Compose `LazyColumn` 안 RN 콘텐츠 측정 무한 루프, Compose 슬롯의 bare 문자열/RN 뷰,
  상시 마운트된 전체 화면 Compose host의 RN hit-test 차단, `BadgedBox`·`onLayoutContent` 오사용,
  `NativeButton` Host stretch, 입력 shell `initialValue`/`value` 혼동, `expo-video`
  `replaceAsync`/`readyToPlay` 순서, 서버에 없는 미디어 크기로 인한 정사각형 강제, 앱 소유 staging을
  거치지 않은 음성 업로드, 뷰어 focus 전 재생 준비, 해제된 player 호출, 썸네일 큐 정체, back stack
  없이 열린 그룹 홈, 로그인 버튼의 SwiftUI modifier 순서와 로고 배경 등)와 회귀 테스트는
  [M14 evidence](evidence/M14.md)의 "라운드 2" 절에 기록한다.
- 사용자 확인(2026-09-28, iOS·Android): L1-L3, A1-A4, N1-N4, R1-R4, W1-W4, V1-V4. R4의 iOS 목록
  끌어서 키보드 닫기는 구현 누락을 고친 뒤(결함 24) 사용자가 확인했다. V2 iPhone 무음 모드 재생,
  V3 햅틱, iOS 전화 수신 중단은 시뮬레이터로 확인할 수 없어 실기기 검증(M18 출시 준비)으로 넘긴다.
- 종료(2026-09-28): 사용자가 R4 수정을 확인하고 M14 종료를 승인했다. 종료 시점 `bun run check:code`
  exit 0(224 suites / 2,094 tests, coverage statements/branches/functions/lines 87.9% / 82.24% /
  87.55% / 90.61%, `check-architecture` PASS). ultrawork의 VERIFY·REFINE·SHIP 격리 리뷰는 사용자의
  종료 결정으로 실행하지 않았다(아래 후속 후보의 품질 정리 항목 참고).

M14 종료 후 후속 후보(각각 별도 결정, 2026-09-30 M17 절의 묶음으로 모음):

- 주제 공지(announcement) 메시지가 markdown 링크를 원문 그대로 렌더한다(raw markdown link).
- 업로드가 만료된(1시간 초과) 실패 메시지는 다시 보내기도, 버리기도 할 수 없다. 재시도 시 만료된
  첨부 재업로드 또는 실패 메시지 버리기 기능이 필요하다.
- 공용 입력 shell 테스트 mock(`NativeInputSheet`/`NativeInputDialog`의 테스트 대역)이 `value`를
  렌더해 실제 shell의 `initialValue` 기반 동작과 어긋난다. mock을 실제 동작에 맞게 고친다.
- 서버 미디어 어댑터 테스트 fixture가 호스트 `now`와 DB `clock_timestamp()`를 섞어 써서 시계
  오차가 있으면 간헐적으로 실패한다(`media_uploads_timestamp_check`).
- dev build 콜드 스타트가 에뮬레이터에서 긴 빈 화면을 보인다. release build 기준으로 다시 측정한다.
- 실기기 검증: V2 iPhone 무음 모드 재생, V3 iOS 햅틱, iOS 전화 수신 중단 뒤 미리듣기 유지.
- 관찰: 기기 검증 중 새 메시지가 도착하던 시점에 Android 뷰어가 한 번 닫혔고 원인은 확인하지 못했다.
- 품질 정리(라운드 2 REFINE 후보): lint 경고 15건, media 화면의 eslint 예외 설정
  (`react-hooks/refs`·immutability), 동영상 플레이어와 음성 재생 조정기 미연결(음성을 틀어도 동영상이
  멈추지 않음), 중복된 player hook, 두 개의 알림 snackbar host.
- 라운드 1에서 넘어왔지만 라운드 2 범위(로그인·계정·알림·대화방) 밖이라 다루지 않은 후보: 인증 게이트
  라우팅 분리(`(auth)/sign-in`), 그룹 목록을 거치지 않고 연 그룹 홈의 `그룹` 제목, 날짜 선택 haptics,
  그룹 기본 대화방 갤러리, Android carousel `maskClip`, 3열 grid 타일 모양과 서버 썸네일, iOS 그룹 정보
  섹션 헤더, iOS toolbar 강조 버튼 tint, 로컬 모드 DB 쓰기 직렬화(로컬 모드는 M17 (B)에서 제거). 상세는 위 "라운드 2 또는 이후
  후보"에 있다. 알림 목적지(E5)는 라운드 2 N2가 현행 경로(대화방·주제)를 유지했고, 아바타 변경은
  M17(B)(라운드 3에서 구현), image-size 의존성 정리는 M17(A)(라운드 2에서 완료)가 맡았다.

### M15. 소프트 삭제 수용 (서버 task-14 연동)

- 상태: `COMPLETED / USER_ACCEPTED` — 구현·기기 검증 완료(2026-09-29). 2026-09-29 사용자 종료
  승인("M15 종료할게. 모든 변경 커밋하고 PR 올린 다음에 머지해.")으로 PR #2(merge `260e1c1`)를
  머지했다. 2026-09-22 사용자 결정으로 로드맵에 등록했고, 2026-09-28 사용자 요청("M15 구현
  시작해. 선행조건인 서버 task-14 먼저 진행하고 배포한 뒤에 시작해.")으로 착수를 승인받았다(근거
  jamye-server `.agents/results/requirements-20260928-171401.md` §1).
- 선행: 서버 task-14(soft delete 계약)의 배포와 contract intake — 충족(1·2·3차 모두 운영 배포, 앱
  `task-app-contract`가 계약 v2 intake 완료; jamye-server 로드맵 §14 task-14); M9(realtime/delta
  엔진, 기존 충족); M13(계정 삭제 흐름, 기존 충족).
- 결정(2026-09-22): 서버는 모든 테이블에 `created_at`/`updated_at`/`deleted_at`를 적용하고, 기존 hard
  delete를 soft delete로 전환하며, 메시지·주제 삭제 API를 신설하고, 계정 삭제도 유예·복구형 soft
  delete로 바꾼다(서버 로드맵 D14·D15).
- 결정(2026-09-28 인터뷰 확정, 근거 jamye-server `.agents/results/requirements-20260928-171401.md`
  §3): 서버 배포는 1차(감사 컬럼 + 삭제 API/이벤트 + 계정 유예 + 필요한 soft delete) 먼저, 나머지 B
  (초대·푸시·알림·읽음 위치·태그·업로드)는 2차로 병행한다(S1). 삭제 권한은 작성자만이고 그룹
  소유자에게 추가 권한은 없다(S2). 삭제한 내용은 서버가 본문·첨부·과거 이벤트 payload까지 완전히
  지우고 되돌릴 수 없다(S3). 계정 삭제 유예 중 표시는 즉시 `탈퇴한 사용자`(사진 없음)이고, 30일 안에
  같은 provider로 재로그인하면 이름·멤버십·글이 복구된다(G1). 복구는 자동으로 일어나고 첫 화면에
  한 번 안내한다(G2). 주제 삭제 진입점은 주제 상세 헤더 메뉴·목록 행 길게 누르기·iOS 스와이프
  3개다(A1). 메시지 삭제는 내 메시지 삭제와 실패한 메시지 버리기 둘 다를 포함한다(A2).
- 사용자 결과: 내 메시지나 주제를 삭제하면 상대방 화면에서도 '삭제된 메시지/주제'로 바뀐다. 삭제된
  주제·메시지는 목록과 알림함에서 사라지거나 placeholder로 남는다. 계정 삭제 후 30일 유예 기간 안에 같은 provider로 다시 로그인하면 계정이 부활한다.
- 계약 범위(구현됨): 메시지 삭제 `DELETE /api/v1/chatrooms/{chatroom_id}/messages/{message_id}`(C6),
  주제 삭제 `DELETE /api/v1/groups/{group_id}/topics/{topic_id}`(T8) — 둘 다 작성자만 호출할 수
  있고 성공 204(같은 대상 재삭제도 204, 재시도 안전), 없는 대상 404, 작성자가 아니면 403
  (`message_author_required`/`topic_author_required`). 계약 버전 `X-Jamye-Contract-Version`을
  current `"2"`/previous `"1"`("0" 지원 종료)로 올리고, v2 요청에만 typed realtime/delta 이벤트
  `message.deleted`·`topic.deleted`를 주며 v1 요청에는 기존 `UnsupportedEventMarker`(scope
  `chat_history`/`group_topics`)를 그대로 준다. 설치된 앱(v1) 보호를 위해 REST 응답 모양은 바꾸지
  않는다 — 당초 계획했던 `CanonicalMessage`/`CanonicalTopic`의 `deleted_at`/`updated_at` 노출 대신,
  삭제된 메시지·주제·주제 대화방을 모든 REST 조회에서 제외(목록 제외, 단건 404)하는 방식으로
  확정했다. 계정 삭제는 30일 유예 뒤 purge이고, 유예 중 같은 provider 재로그인이면 A2 응답 헤더
  `X-Jamye-Account-Restored: true`로 복구를 알린다(`TokenPair` 본문은 불변).

구현 범위:

- Contract v2 intake: 검증기(`validateMessageDeletedEvent`/`validateTopicDeletedEvent`/WS 프레임
  검증)와 `classifyDeltaItem`(S1 델타 아이템을 `type`으로만 판별, E17 재시도 폭주 방지), S1/R1 버전
  헤더, A2 복구 신호(`accountRestored`) intake(`task-app-contract`).
- 계정 SQLite schema v6 migration(삭제 이벤트 로컬 반영).
- 메시지 삭제: 내 메시지 길게 누르기 → 메뉴 맨 아래 빨간 `삭제` → 확인창 → 양쪽 기기 모두
  `삭제된 메시지입니다.`로 표시(흐린 글씨, 첨부·메뉴 없음). 전송 실패한 내 메시지는 같은 `삭제`로
  이 기기에서 버린다(`task-app-chat`).
- 주제 삭제 3개 진입점(상세 헤더 메뉴, 목록 행 길게 누르기, iOS 스와이프) → 확인창 →
  `삭제된 주제입니다.` 상태(입력창 없음, 뒤로 가기 가능). 작성자가 상세 헤더 메뉴로 삭제하면
  곧바로 그룹 주제 목록으로 이동하고, 실패하면 상세에 인라인 오류를 보여준다(`task-app-topics`).
- 탈퇴한 사용자의 표시: 삭제 표시 행의 보낸 사람 이름·사진을 같은 사용자의 다른 로컬 행과 주제
  작성자 표시 전체에 전파한다(`task-app-chat`, AC8).
- 알림함·배지에서 삭제 대상 항목 정리(서버 필터 + 앱 목적지 캐시 무효화).
- 계정 삭제 확인 문구·복구 안내(`task-app-account`; 문구는 DESIGN.md "Account Screen" 참고).
- 서버 task-14 1·2·3차 배포 — 전 범위 soft delete, 계정 삭제 유예·복구, `topic.deleted` 기록 위치
  수정(jamye-server 로드맵 §14 task-14).
- REFINE(동작 보존 정리, `task-refine`): 주제 삭제 확인 문구를 `topic-delete-confirm-copy.ts` 하나로
  모으고, 쓰이지 않던 `topic-edit-button.*`를 지웠다. 그룹 소유권 이전 선택창의 아바타는 Android에서
  공용 `ComposeRnHost`(`RNHostView matchContents`)로 호스팅한다(결함 1과 같은 부류, 선택창 렌더 테스트와
  `ComposeRnHost` 단위 테스트로 확인, 기기 재확인은 하지 않음).

검증 결과:

- 자동 검사(최종값, SHIP 보강 뒤 coordinator 확인): `bun run check:code` 235 suites / 2199 tests 통과,
  coverage statements 87.52% / branches 82.18% / functions 87.12% / lines 90.31%, eslint 오류 0 —
  근거 jamye-server `.agents/results/checks-app-m15-20260928-171401.md`("SHIP final gate").
- 기기 검증(Android 자동 검증 + iOS 공동 세션 + 3차 배포 뒤 재검증) — 상세는 [M15
  evidence](evidence/M15.md), 원본은 jamye-server `.agents/results/device-m15-20260928-171401.md`:
  AC1(양방향 `삭제된 메시지입니다.`)·AC3(iOS 스와이프 + 다른 기기 반영)·AC4(삭제된 주제 상태)·
  AC6(계정 삭제·복구) 통과. AC5(알림함·배지)는 3차 배포(`6dcb6d5`, `topic.deleted`를 그룹 메인
  대화방 피드에 기록하도록 수정) 뒤 통과 — 앱이 열린 그룹만 실시간 구독하는 기존 설계라 그룹 밖
  에서는 그룹을 열 때·푸시·앱 활성화 때 반영된다. AC2(`버리기`)는 삭제된 주제의 대기 메시지가
  결함 5 수정의 로컬 정리(FK cascade)로 함께 지워져 이 흐름으로 도달할 수 없어, 사용자 결정으로
  자동 테스트 근거(`task-app-chat` AC5 테스트)로 대체했다.
- 기기 결함 10건 모두 수정·확인([M15 evidence](evidence/M15.md) §6). 결함 10(탈퇴한 사용자의 삭제
  행이 옛 이름·사진 유지)은 완화됐지만 완전한 해결이 남아 아래 "후속 후보" 참고.
- 테스트 데이터: 테스트 주제 15002~15008·15201·15301·15401·15411과 사용자 테스트 주제는 검증 중
  삭제됐고, 주제 A와 기존 대화는 사용자 결정으로 그대로 뒀다. 검증을 위해 잠시 이전했던 그룹
  소유권은 사용자가 직접 되돌렸다.

미검증 / 별도 승인 필요:

- 커밋·push와 milestone 종료 승인(이 문서 정리는 코드나 git을 건드리지 않는다).
- 서버 D15(30일 유예 후 tombstone 전이, 유예 중 같은 provider 재로그인 시 부활)·D18(새
  `message.deleted`/`topic.deleted` 이벤트)·D19(PostgreSQL `BEFORE UPDATE` 트리거)는 2026-09-22
  사용자 승인으로 locked; 실제 계약 shape는 위 "계약 범위"에서 확정한 대로다.
- 계정 삭제·복구의 실계정 검증은 사용자가 직접 확인했다(E15 운영 데이터 규칙 — 메시지·주제 쓰기는
  테스트 주제에서만 했다).

후속 후보(각각 별도 결정, 2026-09-30 M17 절의 묶음으로 모음):

- 결함 10의 남는 한계: 탈퇴한 사람의 살아 있는 메시지도, 작성한 주제도 기기가 다시 받지 않으면
  삭제 행이 옛 이름·사진으로 남는다. 완전한 해결은 서버 계약 확장이 필요하다.
- 알림 배지는 열린 그룹만 실시간 구독하는 기존 설계라 그룹 밖에서는 그룹을 열 때·푸시·앱 활성화
  때만 반영된다(시뮬레이터·에뮬레이터 dev 빌드는 푸시를 받지 못해 더 눈에 띈다).
- REFINE 후보(관찰, 기능 문제는 아님): 삭제 상태 대화방 헤더에 주제 제목이 남는 것, 내 삭제 행의
  시간 표시가 iOS(없음)와 Android(`시간 · 전송됨` 유지)에서 다른 것, 주제 목록 새로고침에 어색한
  오프라인 복귀 오류 문구(`입력을 유지했으니…`).

### M16. Sign in with Apple (서버 task-15 연동)

- 상태: `COMPLETED / USER_ACCEPTED` — 구현·기기 검증 완료(2026-09-30). 2026-09-30 사용자 종료
  승인("COMPLETE / USER_ACCEPTED로 기록하고 push pr 머지까지 전부 다 진행해", "M16을 닫아")으로 PR #4
  (merge `c7b6958`)를 머지했다. 서버의 test-only 후속과 task-15 로드맵 기록은 jamye-server PR #17
  (merge `fd83621`)로 반영했다. 서버 task-15 운영 배포(`2c93ed1`/homelab 활성화 `fe6a4e9`) 뒤 iOS
  시뮬레이터와 Android 에뮬레이터(로그인 화면 불변, 카카오·Google 회귀)에서 요구사항 §8 검증 1-7번을
  모두 통과했고, ultrawork 세션 `20260930-000919`의 격리 리뷰(VERIFY 3건·REFINE 2건·SHIP 4건)도 모두
  PASS했다(CRITICAL/HIGH 0). 2026-09-30 사용자 요청("앱 M16, 서버 task-15 진행해")으로 착수했고
  2026-09-22 사용자 결정으로 로드맵에 먼저 등록했다.
- 선행: M6(세션 모델, 충족); 서버 task-15 운영 배포(충족, jamye-server 로드맵 §14 task-15); Apple
  Developer 설정 — 개발 bundle id(`dev.local.jamyeapp`, Team `6ZH8V43A7D`)의 App ID Sign in with
  Apple capability와 서버 key(.p8)의 Sign in with Apple service 둘 다 사용자가 직접 켰다(기기 검증
  중 누락을 발견해 조치, 아래 "검증 결과" 참고). production bundle identifier 결정은 M18 선행
  항목으로 남는다 — identity token의 `aud`가 bundle id이므로 그때도 같은 두 설정이 필요하다.
- 결정(2026-09-22): iOS native(`expo-apple-authentication`) + 서버 identity token 검증 방식. Android에는
  Apple 버튼을 표시하지 않는다. 계정 연결은 하지 않고 provider별 별도 계정을 유지한다(서버 D16).
  목적은 App Store Review Guideline 4.8 충족이다.
- 결정(2026-09-30 인터뷰 확정, 근거 jamye-server `.agents/results/requirements-20260930-000919.md`
  §3, §9): U1 토큰 폐기는 계정 삭제 때 Apple 재인증으로 한다 — 삭제를 확인하면 Apple 인증창이 한 번
  더 뜨고, 서버는 새 authorization code로 Apple 토큰을 받아 즉시 폐기(revoke)하며 Apple 토큰 자체는
  저장하지 않는다(서버 D17). U2 Apple Developer 설정은 개발 bundle id로 지금 진행하고 production
  bundle id는 M18에서 정한다. U3 Apple 버튼은 카카오·Google과 같은 48pt 캡슐 SwiftUI 버튼으로
  카카오 → Google → Apple 순서, 같은 크기로 맨 아래 두며 라이트 검정·다크 흰색이고 iOS에만
  표시한다. U4 설치·재빌드는 coordinator가 하고, 시뮬레이터의 Apple ID 로그인은 사용자가 직접
  한다. U5 서버를 먼저 운영 배포한 뒤 앱을 시뮬레이터에서 검증한다. U6 첫 닉네임은 Apple이 준
  이름, 없으면 기존 `카카오{6}`·`Google{6}`과 같은 방식으로 `Apple`+숫자 6자리다. U7 Apple 계정
  삭제 확인창은 기존 문구 뒤에 `삭제하려면 Apple 인증을 한 번 더 진행합니다.`를 붙이고, 인증을
  취소하면 삭제도 취소된다. 기기 검증 중 추가 결정(§9): U8 계정 삭제 때 푸시는 삭제가 승인될
  때만 꺼진다 — 앱은 삭제 요청 전에 푸시를 끄지 않고, 서버가 삭제 트랜잭션에서 push installation을
  끈다. 실패·취소 시 푸시는 그대로다. U9 계정 삭제 실패 안내(그룹 소유권 이전 필요/일반 실패)는
  둘 다 제목 `계정 삭제`, 버튼 `확인` 하나의 Alert로 보인다(iOS 시스템 Alert, Android Material
  다이얼로그, 인라인 문구 없음).
- 사용자 결과: iOS에서 'Apple로 로그인'으로 로그인하고 Kakao/Google과 같은 세션
  모델(TokenPair·refresh·logout·계정 삭제)을 쓴다. 기기 검증(2026-09-30)으로 확인했다.
- 계약 범위(구현됨): `POST /api/v1/auth/apple/exchange`(A6) — `identity_token`, `raw_nonce`, 선택
  `full_name` → 기존 TokenPair, 유예 계정 복구 시 `X-Jamye-Account-Restored: true`. 서버 검증:
  Apple JWKS RS256 서명, `iss=https://appleid.apple.com`, `aud` allowlist(`JAMYE_APPLE_AUDIENCES`),
  `exp`/`iat`, `nonce`(SHA-256) 일치, `sub` 길이. 검증 실패는 원인을 나누지 않고
  `422 apple_identity_token_invalid` 하나로 수렴한다(원인은 서버 내부 tracing에만 남는다). 기능이
  꺼져 있으면 `404 oauth_provider_not_supported`다. 계정 삭제(`DELETE /api/v1/me`)는 Apple
  계정일 때만 JSON body(`identity_token`/`authorization_code`/`raw_nonce`)를 허용하고, 서버가
  identity token 검증 → ES256 client_secret으로 Apple `/auth/token` 교환 → `/auth/revoke` 폐기 →
  기존 계정 삭제 유예 transaction 순서로 처리한다(App Store Review Guideline 5.1.1(v), 서버
  D17). Kakao·Google 계정의 U3 body 거부는 그대로다. `auth_identities.provider` CHECK에 `apple`을
  추가하는 migration `0018`. 계약은 `contract_version` `"2"`를 유지하며 `User.provider` enum에
  `apple`을 추가한다. 상세는 jamye-server 저장소의 로드맵 §14 task-15와 ADR 0006(mobile
  OAuth)에 있다.

구현 범위:

- Apple 버튼: iOS 전용 `apple-login-button.ios.tsx`. `AuthScreen`에 카카오 → Google → Apple
  순서로 같은 48pt 캡슐(최대 440pt 폭)에 SF Symbol `apple.logo`, 라벨 `Apple로 로그인`을 두고
  라이트 검정·다크 흰색으로 반전한다. `AppleAuthentication.isAvailableAsync()`가 false면 숨기고,
  진행 중에는 로고 자리에 spinner를 두고 세 버튼 모두 비활성화한다. iOS 부제는 `카카오, Google
또는 Apple 계정으로 로그인합니다.`로 바뀌고 Android는 기존 문구(`카카오 또는 Google 계정으로
로그인합니다.`)를 유지한다.
- Apple 인증 포트(`apple-authentication-port.ts`/`.ios.ts`)와 mock, `expo-crypto` 기반 raw/hashed
  nonce(`createAppleNonce`). `auth-controller.ts`의 `signInWithApple`이 `FULL_NAME` 범위만
  요청해 A6를 호출하고, 성공하면 기존 `persistThenProfile`과 복구 헤더 처리(`accountRestored`)로
  이어진다. Apple 시트 취소는 조용히 로그인 화면에 남고, 다른 오류는 기존 system feedback +
  `다시 시도`로 안내한다.
- 계정 화면: provider 라벨에 `Apple 계정으로 로그인됨`을 추가하고, Apple 계정의 삭제 확인창에만
  U7 문구를 붙인다. `use-delete-account-flow.ts`가 같은 Apple 인증 포트로 재인증(요청 범위 없음)한
  뒤 proof를 U3 JSON body로 보낸다. 재인증 취소는 조용히 삭제를 취소하고, 서버 오류는 기존 오류
  표시로 안내한다.
- 계약 intake: 서버 배포 뒤 A6와 U3 Apple proof schema를 closure 목록에 추가해 재생성했다.
  `User.provider` validator는 코드 변경 없이 계약의 enum을 그대로 컴파일해 `apple`을 받아들인다.
- `expo-apple-authentication`(coordinator install 결과 버전)을 추가하고 `ios.usesAppleSignIn =
true`를 켰다. 체커 고정값(`APPROVED_DEPENDENCIES`, `APPROVED_BUN_LOCK_SHA256`, `expectedIos`)과
  `docs/development-workflow.md` 버전 표를 갱신했다. Android에는 네이티브 변경이 없다.
- 기기 검증 중 결함 수정(U8/U9, `task-app-device` fix1): 계정 삭제가 실패해도 푸시가 꺼진 채 남던
  결함을 고쳤다 — 앱이 삭제 요청 전에 하던 푸시 해제를 없애고 서버가 삭제 트랜잭션에서 처리하도록
  옮겼다. 삭제 실패 안내 두 가지(그룹 소유권 이전 필요/일반 실패)를 인라인 문구 대신 제목
  `계정 삭제`, 버튼 `확인` 하나의 Alert로 바꿨다.
- 격리 리뷰 반영(REFINE·SHIP, 동작 불변): iOS 캡슐 버튼 골격을 `capsule-login-button.ios.tsx`로
  모아 카카오·Google·Apple 버튼이 함께 쓰고(`BRAND_LOGO_SIZE` 공유), 계정 화면의 삭제·로그아웃
  문구와 provider 라벨·삭제 확인 문구를 `account-screen.constants.ts`로 모았으며, 복구 헤더 판정을
  `isAccountRestored`로 뽑았다. SHIP 품질 리뷰가 지적한 `auth-controller.ts` branch coverage
  80.11%는 Apple 실패 경로 테스트 2개(Apple 포트 없음, native 시트 오류)로 81.81%까지 올렸다.

검증 결과:

- 최종 자동 검사(REFINE·SHIP 반영 후, coordinator 확인): `bun run check:code` 238 suites / 2254
  tests 통과, coverage statements 87.62 / branches 82.32 / functions 87.24 / lines 90.41(기준 80),
  architecture 검사 PASS, eslint 경고 15(기존 기준선). fix1 직후 수치(2252 tests)는 jamye-app
  `.agents/results/device-m16-20260930-000919.md` §3에 있다. 서버 task-15 필수 검사 7개는 test-only
  후속 fix2까지 반영한 상태에서 모두 exit 0이다(915 tests).
- 격리 리뷰(ultrawork, 2026-09-30): VERIFY(정합성·안전·회귀), REFINE(재사용·일관성), SHIP(품질·UX
  흐름·연쇄 영향·배포 준비) 9건 모두 PASS, CRITICAL/HIGH 0. 집계는 jamye-server
  `.agents/results/result-qa-20260930-000919.md`.
- 기기 검증(iOS 시뮬레이터·Android 에뮬레이터, 운영 서버 기준, 2026-09-30) — 상세는
  [M16 evidence](evidence/M16.md), 원본은 jamye-app `.agents/results/device-m16-20260930-000919.md`
  (로컬 전용): 요구사항 §8 1-7번 모두
  PASS. 로그인 화면(카카오→Google→Apple 순서·같은 크기·라이트 검정/다크 흰색·iOS 부제, Android
  불변), Apple 첫 로그인(신규 계정, 닉네임, `Apple 계정으로 로그인됨`), 로그아웃→재로그인(같은
  계정), 인증 취소(조용히 로그인 화면), 계정 삭제(U7 문구→재인증→삭제→로그인 화면, 시뮬레이터
  설정에서 앱 연결 해제 확인), 유예 중 재로그인(복구 + `계정이 복구되었습니다.` 1회), 카카오·Google
  회귀(로그인·삭제 모두 그대로) 전부 통과했다.
- 검증 중 Apple Developer 설정 누락 두 곳을 찾아 사용자가 직접 고쳤다(요구사항 E21): App ID의
  Sign in with Apple capability가 없으면 로그인이 `-24000 Invalid client`로 실패했고, 서버 .p8
  키의 Services에 Sign in with Apple이 없으면 삭제 때 코드 교환이
  `apple_authorization_code_invalid`로 거부됐다. 두 설정 모두 M18 production bundle id에도 다시
  필요하다.

미검증 / 별도 승인 필요:

- 기기에서 따로 확인하지 않은 경로 두 개(SHIP UX 리뷰 LOW, 단위 테스트로만 확인): 계정 삭제 중
  Apple 재인증 취소(`tests/features/account/model/use-delete-account-flow.test.ts`)와 앱 수준 Apple
  로그인 오류 안내(`tests/core/auth/auth-controller.test.ts`). 기기 검증의 `-24000` 실패는 OS의
  Apple 시트 안에서 난 것이라 앱 안내가 떴는지는 기록되지 않았다.
- production bundle identifier와 그에 대한 App ID·key Sign in with Apple 설정은 M18에서 별도로
  진행한다.

후속 후보(각각 별도 결정, 2026-09-30 M17 절의 묶음으로 모음):

- Apple 서버 간 알림(server-to-server notifications, consent-revoked) endpoint: 사용자가 Apple
  ID 설정에서 앱 연결을 끊어도 서버가 그 신호를 받아 계정을 정리하지 못한다. 범위 밖으로 미룬
  항목(요구사항 §5)이며 별도 승인이 필요하다.
- Expo SDK 57 patch 22개가 최신보다 뒤처져 있다(`@expo/ui` 57.0.17→~57.0.21, `expo`
  57.0.21→~57.0.26 등). 새 모듈 `expo-apple-authentication`만 SDK와 맞고, 나머지 일괄 patch
  갱신은 별도 승인이 필요한 의존성 변경이라 후속으로 미룬다.
- Apple 어댑터가 `/auth/token`·`/auth/revoke`의 4xx를 모두 `apple_authorization_code_invalid`
  하나로 뭉뚱그리고 Apple이 준 `error` 값(invalid_client/invalid_grant 등)을 범주형으로도 남기지
  않는다. 로그에 범주만 추가하면 설정 문제와 실제 코드 무효를 구분하기 쉬워진다(서버, 기기 검증
  중 발견).
- Android 에뮬레이터가 `default_boot` 스냅샷으로 오래된 dev client 상태(예: 이전 빌드에 없던
  네이티브 모듈)를 되살리는 문제의 재발 방지 절차를 문서로 정리한다.
- M18 production bundle id를 정하면 App ID + key 양쪽에 Sign in with Apple을 다시 설정해야
  한다(요구사항 E21).
- `auth-controller.ts`가 622줄이고 `createAuthController`가 543줄짜리 factory 하나다(M16 전에도
  약 511줄). characterization test를 먼저 둔 뒤 세션 저장, 세대 관리, Apple 이름 정리 같은 묶음을
  모듈로 나누고 `max-lines-per-function` lint 규칙을 추가한다(REFINE·SHIP 품질 리뷰).
- 카카오·Google 계정으로 로그인할 때마다 새 push installation이 생기는지 관찰한다(검증 중 live
  installation이 provider별 2개였다).

### M17. 잔여 백로그

- 상태: `planned_unapproved` — 2026-09-22 사용자 결정으로 네 묶음((A)-(D))을 등록했다. 2026-09-30
  사용자 요청("M14–M16의 각 절에 적힌 '후속 후보'까지 모아서 M17 묶음을 정리해줘")으로 M14–M16의
  후속 후보를 (A)-(D)에 더하고 (E)·(F)를 새로 만들었다. 항목별 착수는 개별 승인이다.
  2026-09-30부터 2026-10-01까지 라운드 1이 (E)·(F) 전체를 구현하고 자동 검사·기기 검증까지
  마쳤다(상세는 [M17 evidence](evidence/M17.md)). 2026-10-01 사용자 요청("커밋하고 PR 생성한
  후에 머지해")으로 PR #6(merge `589c5e0`)을 머지했고, 같은 날 사용자가 라운드 1 종료를
  승인했다("라운드 1 종료 승인할게"). 종료와 함께 그룹 갤러리 화면 제목을 주제 갤러리와 같은
  `갤러리`로 통일했다(사용자 결정). 같은 날 사용자가 (A) 착수를 승인했다("다음 착수 범위는 A를
  진행할게"). 2026-10-06 (A)의 구현과 양 플랫폼·실기기 수용을 마쳤고(아래 "(A) 결과") PR #8(merge
  `671b649`)로 main에 들어갔다. 같은 날 사용자는 M17을 닫지 않고 남은 라운드를 진행하기로 결정했고
  (B)를 라운드 3으로 착수했다. 2026-10-06~07 (B) 세 항목과 Expo patch 정렬(B7)을 구현하고 iOS
  시뮬레이터·Android 에뮬레이터와 사용자 본인 계정으로 검증했다(아래 "(B) 결과"). 서버 task-19(아바타
  업로드)는 운영에 배포·활성화했다. 라운드 3의 격리 리뷰(VERIFY/REFINE/SHIP)를 모두 통과했고 2026-10-07
  사용자 요청("앱 브랜치 기능별로 커밋 나누고 PR 만들어서 머지해")으로 PR #9를 머지했다. 같은 날 사용자가
  라운드 3 종료를 승인했다("라운드3 종료, M17은 아직 종료하지 마"). (C)·(D)와 라운드 1·2가 남긴 후속 항목은
  개별 승인 전까지 `planned_unapproved`로 남는다.
- 선행: 항목별 상이(아래 묶음별 목록)
- 결정(2026-09-22): 각 항목은 개별 승인으로 착수하고, M18 release에 포함할지도 개별로 결정한다. 서버
  계약이 필요한 항목은 서버 task-16(또는 별도 task)을 선행한다.
- 사용자 결과: 출시를 막는 결함이 정리되고, 보류했던 기능과 M14–M16에서 미룬 다듬기 중 선택한 것이
  제품에 들어간다.
- 계약 범위: (C) 묶음이 서버 계약 변경을 요구한다. (B)의 아바타 업로드는 서버 task-19(계약 추가·운영
  배포)와 함께 했다. (D)는 서버 코드와 운영 작업이고, 나머지는 app-only다.
- 목록 규칙: M14–M16 절의 후속 후보 목록은 기록으로 남기고, 이 절을 단일 목록으로 쓴다. 항목 끝
  괄호는 출처다 — `등록`은 2026-09-22 등록, `M14`·`M15`·`M16`은 해당 절의 후속 후보다.

| 묶음                      | 성격                | 선행·비고                                                       |
| ------------------------- | ------------------- | --------------------------------------------------------------- |
| (A) 앱 출시 blocker       | M18 선행            | 기존 기록은 [개발 workflow](development-workflow.md)            |
| (B) 보류된 앱 기능        | app + 서버 task-19  | 라운드 3 완료(2026-10-07, PR #9)                                |
| (C) 채팅·미디어 기능 확장 | 서버 계약 선행      | 메시지 편집은 서버 task-16 후보, 나머지는 별도 product decision |
| (D) 서버·운영             | 서버·homelab 작업   | 서버 task-16과 homelab 로드맵에서 수행                          |
| (E) UI/UX·동작 다듬기     | app-only            | M14 라운드 1 잔여와 M14·M15 관찰                                |
| (F) 코드 품질·개발 환경   | app-only, 동작 불변 | M14 REFINE 후보와 M16 품질 리뷰                                 |

(A) 앱 출시 blocker:

- 의존성: dependency audit의 image-size High 2건 재감사(등록, M14), Expo SDK 57 patch 22개
  갱신(M16, 별도 의존성 승인)
- Android 시작 ANR 원인 규명(등록). dev build 콜드 스타트의 긴 빈 화면은 release build로 다시
  잰다(M14).
- 자동 E2E(등록)
- 실기기·접근성 수용: VoiceOver/TalkBack, 200% 텍스트, reduce motion(등록). 같은 기회에 확인할 기기
  항목은 V2 iPhone 무음 모드 재생, V3 iOS 햅틱, iOS 전화 수신 중단 뒤 미리듣기 유지(M14)와 계정 삭제
  중 Apple 재인증 취소, 앱 수준 Apple 로그인 오류 안내(M16 미검증)다.
- production identity·서명 준비(등록)

(A) 결과 (2026-10-06 구현·기기 수용 완료, PR #8 merge `671b649`; 상세는
[M17 evidence](evidence/M17.md)와 [개발 workflow](development-workflow.md)):

- 의존성: Expo SDK 57 patch 22개를 `expo install --check` 기준으로 정렬했다(`expo` 57.0.26,
  `expo-router` 57.0.24 등). expo-audio의 필수 peer인 `expo-asset ~57.0.18`은 이미 설치된 패키지를
  직접 선언만 했다(새 코드 없음). devDependency `@react-native/metro-config`를 `0.86.3`으로
  고정해 중첩 metro 0.87과 image-size가 트리에서 빠졌고, image-size 로컬 패치는 삭제했다.
  expo-router 패치는 새 버전 키(57.0.24)로 유지한다. fast-uri·brace-expansion은 override 없이
  lock 갱신으로 같은 메이저의 수정판을 받았다. `bun audit` 14건 → 0건, `bun run check:expo`
  (expo-doctor 21/21) 통과.
- 접근성: 대화 화면 첫 포커스용 숨긴 heading은 iOS에서만 렌더한다(F-4: Android TalkBack은 포커스
  요청을 반영하지 않고 같은 문구를 두 번 읽음). Android composer 입력란·알림 설정 스위치 접근성
  이름, 음성 탐색 막대 accessibilityActions, 44×44 미만 터치 영역, iOS 날짜 칩 selected, Apple 로그인
  오류 알림(제목과 `다시 시도`)을 고쳤다. reduce motion이면 자동 스크롤 애니메이션·동영상 modal
  slide·이미지 fade를 끈다. 200% 텍스트·font scale에서 재현된 항목은 고쳤다: 대화 헤더 제목·부제
  배율 상한(iOS), iOS composer 줄 수 cap, Android snackbar 높이 `160dp × fontScale`, Android
  `AppSymbol`의 `size / fontScale` 보정(그룹 정보 연필 잘림, F-3).
- production identity: `APP_VARIANT=production` 경로를 구현했다. 이름 `잼얘좀`, iOS bundle id·Android
  package `com.ridewithmin.jamyeapp`, associatedDomains의 `?mode=developer` 제거, `aps-environment`
  production, `expo-dev-client`는 `addGeneratedScheme: false`로 개발 scheme `exp+jamye-app` 0건이다.
  native 폴더 없는 임시 사본의 `expo config --type introspect`(읽기 전용)로 확인했다. 빌드·prebuild·
  서명은 하지 않았다. production prebuild의 iOS 프로젝트 이름은 비ASCII 앱 이름 때문에 `app`이 된다.
- 자동 E2E: Maestro 2.8.0(nix devShell)으로 `e2e/maestro/dev-client-journeys.yaml`의 7개 여정을
  로그인된 dev client에서 `bun run e2e:ios`·`bun run e2e:android`로 실행한다. iOS 시뮬레이터·Android
  에뮬레이터 모두 PASS. 운영 쓰기는 테스트 그룹의 텍스트 메시지로 한정했다.
- Android 시작 ANR: dev build cold start를 세 실행 방식으로 11회 반복 재현했고 ANR은 재현되지
  않았다. main thread `Choreographer: Skipped` 경고(약 530-600ms)는 JS가 실행되지 않는 실행에서도
  나와 expo-dev-launcher debug 경로(release에는 컴파일되지 않는 소스셋)로 판정했다. MediaProvider
  temp sweep은 1-9ms라 원인에서 배제했고 앱 동작은 바꾸지 않았다. `__DEV__` 전용 `[startup-timing]`
  계측(첫 화면까지, 세션 복원, temp sweep)을 더했다. 에뮬레이터 세션 복원은 2.3-3.7초라 3초 splash
  안전 시간을 넘길 수 있다. 한계: 세션 중 dev-client 딥링크 처리 맥락에서 크래시 2건과 ANR 1건을 관찰했으나
  재현되지 않았고(모두 debug dev-launcher 경로), release build cold start는 측정하지 않았다(새 승인 필요).
- 기기 수용(iOS 실기기 iOS 27.0.x, iOS 시뮬레이터, Android 에뮬레이터): C16 항목은 PASS 또는 결함
  수정이다. 수정한 결함(회귀 테스트 RED → GREEN): F-1 iOS 이미지 뷰어 상단 버튼, F-3 Android 200%
  그룹 정보 연필 잘림, F-4 Android TalkBack 숨긴 heading 중복·포커스 무시, F-7 iOS 뒤로 버튼
  VoiceOver 이름(`(tabs)` → `이전 화면`), F-8 iOS 27 실기기 실행 즉시 종료(iOS 27 SDK는 UIScene
  life cycle 필수; SDK 57을 유지하고 로컬 config plugin `tools/expo/with-ios-scene-lifecycle.cjs`로
  SDK 58 템플릿의 scene 구성을 이식), F-10 첨부 길게 누르기가 공유 시트와 메뉴를 함께 열던 문제
  (메뉴의 `공유`·본인 `삭제`만 열림), F-11 끝까지 재생한 음성을 다시 누르면 재생되지 않던 문제.
  F-2(iOS 실기기 음성이 Android에서 즉시 끝 위치로 감)는 시뮬레이터 마이크의 무음 파일과 F-11의 영향이었고
  Android 재생 경로 결함이 아니라 PASS로 판정했다. F-9(iOS 실기기 녹음이 거의 빈 파일)는 사용자가
  재확인해 해결로 판정했고 원인은 미확정이다. VoiceOver 실기기 확인은 사용자 결정으로 넘겼다(iOS 숨긴
  heading은 현재대로 유지). 계정 삭제 중 Apple 재인증 취소와 삭제·복구는 사용자가 직접 확인했다.

(A)에서 M18로 넘긴 항목:

- 스토어 출시 작업(M18 핵심 작업과 겹치는 부분): 아이콘·스플래시 교체, 서명, 빌드 파이프라인과
  production/release 빌드(이번 라운드는 production prebuild·빌드를 하지 않았다), push production
  credential(APNs·FCM)과 OAuth 콘솔 production 등록(Kakao/Google/Apple), 서버 AASA/assetlinks 기본값
  (지금은 `dev.local.jamyeapp`)과 Apple audience를 production id로 바꾸는 서버 변경, Firebase production
  client 추가(`googleServicesFile` 경로는 그대로, 사용자 작업), release build cold start 측정.
- SDK 58 업그레이드 후속: 58이 stable(`latest`)이 되면 올리고 로컬 iOS scene life cycle plugin
  (`tools/expo/with-ios-scene-lifecycle.cjs`)을 지운다. iOS 27 SDK 빌드는 UIScene 채택이 필수라
  release 빌드도 같은 이유로 막힌다.
- 후속 과제(각각 별도 결정): F-5 iOS 최대 텍스트 크기(약 357%)에서 로그인 소개 문구와 버튼이 겹침
  (M18 후보, 200% 기준 밖), F-6 오프라인·불안정한 네트워크로 앱을 처음 열 때 fail-closed refresh가
  로그아웃시킴(M18 후보, 의도된 설계라 이번 라운드는 바꾸지 않음. 2026-10-06 정상 유휴 뒤에도 두 번
  관찰돼 우선순위를 올림), Android 200%에서 snackbar가 화면 하단보다
  조금 위에 뜸, Android 스택 header 제목이 글자 크기를 따라 커지지 않음, composer가 4줄로 커질 때
  마지막 메시지가 가려짐, iOS 알림함 행의 본문 열이 좁음, 계정의 dev 전용 개발자 섹션 문구 겹침.

(B) 보류된 앱 기능 — 세 항목 모두 라운드 3(2026-10-06~07)에서 구현·검증했다(아래 "(B) 결과"):

- 아바타 업로드([ADR 0008](adr/0008-account-lifecycle-placement.md) 5번; U2 + MD1/MD2 재사용)(등록,
  M14의 아바타 변경) — 라운드 3 완료. 서버 task-19와 함께 했고
  [ADR 0015](adr/0015-avatar-hosting-and-local-data-purge.md)가 ADR 0008 5번을 대체한다.
- 계정 삭제 후 파괴적 로컬 정리(ADR 0008 6번)(등록). 별도 명시 승인이 조건이었고 2026-10-06 사용자
  요청이 그 승인이다(범위: "복구 가능 기간 30일이 지난 뒤") — 라운드 3 완료.
- bootstrap/local-fixture 모드 정리(M6에서 미룸; M4 bootstrap contract 제거 여부 결정)(등록) — 라운드 3
  완료. 사용자가 모드를 없애기로 결정했고, 모드와 함께 로컬 모드 DB(`jamye.db`) 쓰기 직렬화 질문(M14)도
  사라졌다.

(B) 결과 (2026-10-06~07 구현·검증·격리 리뷰 완료, 2026-10-07 라운드 종료 승인, PR #9; 상세는
[M17 evidence](evidence/M17.md) 라운드 3 절과 [개발 workflow](development-workflow.md)):

- local-fixture/bootstrap 제거: `EXPO_PUBLIC_APP_MODE`를 없애고 API·미디어 origin을 필수로 만들었다
  (누락하면 앱이 시작할 때 `EXPO_PUBLIC_API_ORIGIN is required.` 같은 오류). `src/app/local-fixture.tsx`,
  fixture DB 런타임·repository, M4 bootstrap 계약(`contracts/bootstrap/`, bootstrap 생성·검사 도구,
  `src/core/contracts/{index,canonical-json,map-message-event,validate-wire}.ts`)과 관련 테스트까지
  35개 파일(약 6,860줄)을 지웠다. 운영 경로가 빌려 쓰던 타입·헬퍼(`Migration`, `ChatMessage`,
  `ChatConversation`, `ClockPort`, `ChatSendController`)는 소비하는 모듈 가까이로 옮겼다. checker는 M5
  선례대로 `M17_RETIRED_FIXTURE_PATHS`를 `AUTHORIZED_DELETE_PATHS`에 등록하고 폐기 경로의 부활을 막는
  `m17-retired-fixture-transition` 검사를 더했다. 서버 계약 경로와 계정 DB 경로는 바꾸지 않았다. 개발
  기기의 옛 `jamye.db`는 지우지 않았다(별도 파괴 작업). ADR 0004와 evidence M3-M17은 역사 기록이라 그대로
  둔다.
- 아바타(서버 task-19): 아바타 전용 업로드 U4(시작, presigned PUT)·U5(완료: 서버가 객체를 확인하고
  `users.avatar_url`을 서버가 만든 공개 URL로 바꾼 뒤 `User`를 돌려줌)와 인증 없는 공개 조회 U6를
  더했다. URL은 업로드마다 새로 생기는 추측 불가 ID라 바뀌지 않고 오래 캐시한다(migration 0019,
  `user_avatar_uploads`). 사진을 바꾸거나 U2에 `""`를 보내 지울 때, 그리고 계정이 영구 삭제될 때 이전 서버
  호스팅 객체를 삭제 대기열에 넣어 worker가 MinIO에서 지운다. U2의 `avatar_url`은 https URL, 512자 이하만
  받고 `""`는 지우기, `null`은 무시다.
  - 운영 배포(사용자 B5 승인, M16과 같은 2단계): midgard DB 백업(pg_dump)·개수 사전 집계 → jamye-server
    PR #18(merge `f86012e`, 단일 커밋, CI 통과)로 기능 꺼짐 배포(homelab 자동 flake input 갱신 PR #98,
    migration 0019 적용) → 기능 꺼짐 smoke(무인증 U4·U6 404) → homelab PR #99(merge `972ce7a`)로 공개 URL과
    공개 조회 rate limit 6000회/60초 설정 → 활성 smoke(무인증 U4·U5 401, 없는 U6 404). 배포 전 안전
    리뷰는 CRITICAL·HIGH 0건이었다. 프록시 뒤에서는 모든 사용자가 한 rate limit 버킷을 공유해 기본 600회에서
    올렸다.
  - 앱: 계정 화면 상단 사진과 `프로필 사진` 행이 같은 메뉴(`사진 선택`, `기본 이미지로`)를 연다(iOS
    SwiftUI `Menu`, Android M3 `DropdownMenu`). 고른 사진은 시스템 정사각형 자르기를 거쳐 512px
    JPEG(EXIF 제거, 1 MiB 초과 거부)로 올린다. 업로드 중에는 아바타에 스피너를 두고 메뉴를 막으며, 실패하면
    한국어 이유와 `다시 시도`를 보인다. 사진 선택·재인코딩은 `platform/` 어댑터에 있고 새 의존성은 없다.
    iOS 사진 권한 문구에 프로필 사진 용도를 더했다. 앱의 아바타 지우기가 `null`을 보내 서버에서 아무 일도
    일어나지 않던 결함은 `""`를 보내도록 고쳤다.
- 30일 뒤 로컬 DB 정리: 계정 삭제(U3)가 성공하면 logout 직전에 해시된 DB 파일 이름과 기기 시각만 문서
  디렉터리 JSON registry에 기록한다(userId·origin·이메일 원문은 저장하지 않음). 앱을 시작해 세션 복원과
  계정 scope open이 정착한 뒤 비동기 sweep이 30일 이상 지난 항목의 DB와 `-wal`·`-shm`·`-journal`을
  지운다. 30일 안에 같은 계정으로 다시 로그인해 scope가 열리면(복구) 예약을 지우고, 열려 있는 계정의 DB는
  지우지 않는다. 실패는 사용자에게 보이지 않고 다음 실행에서 다시 시도한다. 취소·sweep·계정 DB open이 한
  mutex를 공유하고 로그에는 건수만 남는다. 이 기능 이전에 생긴 고아 DB는 기록이 없어 건드리지 않는다.
- Expo patch 정렬(B7): 2026-10-06 Expo가 SDK 57 새 patch를 공개해 `check:expo`가 실패했고, 사용자가
  이번 라운드에 맞추기로 했다. `expo install --fix`로 10개(`expo` 57.0.27, `@expo/ui` 57.0.22,
  `expo-asset` 57.0.19, `expo-auth-session` 57.0.14, `expo-constants` 57.0.21,
  `expo-image-manipulator` 57.0.21, `expo-linking` 57.0.12, `expo-notifications` 57.0.22,
  `expo-router` 57.0.25, `expo-sqlite` 57.0.4)를 올렸다. incremental install이 남긴 중복 사본을 지우고
  `bun install --frozen-lockfile`로 lock 일치를 확인했다. expo-router 로컬 patch는 57.0.25에 그대로
  적용되어 `expo-router@57.0.25.patch`로 옮겼다. `expo install`이 제안한 `expo-asset` config plugin은
  추가하지 않았다(expo-doctor 21/21, native 설정 변경 없음). `bun audit`은 기존 수용 위험 2건만 남는다.
  checker 고정값과 미러 테스트는 coordinator가 고쳤다. 위 (A) 결과의 patch 번호는 당시 기록이다.
- 검증: `bun run check:code`(마지막 확인, SHIP 수정 뒤: 255 suites / 2,611 tests PASS, coverage
  statements 88.53 / branches 83.17 / functions 87.99 / lines 91.2, architecture 위반 0건)와 `bun run check:expo`(B7 정렬
  뒤 expo-doctor 21/21). 서버는 format·clippy·contract-check·전체 test 통과이고, 앱의
  `contracts/server/openapi.json`은 서버 `f86012e`와 byte 동일하다. 기기: iOS 26.5 시뮬레이터와 Android
  API 36 에뮬레이터 dev client(B4 재빌드, Expo patch 정렬 포함)에서 (1) fixture 없는 시작 → 세션 복원 →
  그룹 목록(재시작 포함), (2) 30일 정리(registry 시드: 31일 전 항목 삭제, 29일 23시간 항목 유지, 열린
  계정 DB 유지; 두 플랫폼 sweep 로그 `due:1 removed:1`)를 확인했다. 아바타는 사용자가 본인 계정으로
  2026-10-07 두 플랫폼에서 업로드·교체·`기본 이미지로`와 Android 비행기 모드 실패 → `다시 시도` 성공을
  직접 확인했다("예상대로 작동"). 서버 집계(개수만): 교체·해제된 호스팅 객체 5건의 공개 URL이 모두 404이고
  삭제 대기열 5건이 모두 `succeeded`다. 새 결함은 없었다. coordinator는 계정 삭제와 운영 아바타 변경을
  하지 않았다.
- 격리 리뷰(ultrawork `20261006-174701`): VERIFY 3건(정합성·안전·회귀), REFINE 2건(재사용·일관성), SHIP
  4건(품질·UX·연쇄 영향·최종)이 모두 PASS했고 CRITICAL·HIGH는 0건이다. VERIFY에서 아바타 presigned PUT
  URL의 미디어 origin 확인 누락(MEDIUM)을 채팅 미디어와 같은 검증으로 고쳤고, 이미지 해제 오류 때의 임시
  파일 정리와 DB 파일 삭제의 이름 가드를 더했다. REFINE은 동작을 바꾸지 않고 실패 알림·메뉴 동작, DB 파일
  이름 판별, 이미지 변환 모듈을 공유로 모았다. SHIP에서는 업로드 시작·완료·기본 이미지 복귀를 화면
  낭독기에 알리고, iOS 상단 사진에 접근성 이름·busy 상태를 주고, 복구 취소 때 DB 이름 계산 실패를 고정
  이벤트로 기록하도록 고쳤다(수정 줄을 되돌린 RED 10건 실패 → GREEN).
- 한계: (1) 다른 화면과 대화 행에 캐시된 내 옛 `sender_avatar_url`은 즉시 갱신하지 않고 다음 기록
  갱신 때 바뀐다. (2) 사진을 `기본 이미지로` 해제하면 로그인 때 가져온 카카오·Google 사진으로 돌아가지
  않는다. (3) 업로드 진행률은 시작·완료만 알려 스피너로 표시하고, U4를 재시도할 때마다 새 `upload_id`를
  받는다(실패한 보류 업로드는 서버가 정리). (4) 공개 조회 rate limit 6000회/60초는 프록시 뒤에서 전체
  사용자가 공유하는 버킷이다. 실제 client IP 기준 제한은 후속 과제다. (5) 30일 기준은 기기 시계이고
  정리는 앱을 시작한 뒤에만 일어난다(백그라운드 작업 없음). 다른 기기에서 계정을 복구해도 이 기기의
  로컬 DB는 30일 뒤 지워지며 보내지 못한 outbox는 사라진다. registry는 앱을 삭제하면 DB 파일과 함께
  사라진다. (6) `UserPatchInput.avatarUrl` 타입이 아직 `null`을 허용한다(와이어에는 `""`로 정규화).
  `eslint.config.js`의 삭제된 fixture 모듈 제한 패턴 잔재도 정리 후속이다. (7) 실기기 확인, 새 메뉴의
  VoiceOver/TalkBack·큰 글꼴 확인은 이번 라운드에 별도로 기록하지 않았고, release build 측정도 하지 않았다.
  (8) SHIP UX 리뷰 후속: `기본 이미지로` 확인 단계(제공자 사진은 복구되지 않음), 사진 권한 거부 알림의
  `설정 열기`, rate limit 재시도 대기 시간 표시, 업로드 진행 표시 scrim 대비.

(C) 채팅·미디어 기능 확장(서버 계약 선행):

- 메시지 편집(등록, 서버 task-16 후보)
- 상대방 메시지별 읽음 표시, 주제별 안읽음 표시, presence/typing/reaction(등록, 각각 별도 product
  decision)
- 탈퇴한 사용자의 삭제 행이 옛 이름·사진으로 남는 문제의 완전한 해결(M15 결함 10의 남은 한계)
- 3열 grid의 서버 썸네일(M14, 타일 모양은 (E))
- 주제 공지 구분값(M17 VERIFY, 사용자 결정 U14): 서버는 주제 공지를 일반 `kind='user'` 메시지로
  저장하고, 앱은 본문 형식만 보고 제목을 링크로 그린다. 그래서 그룹 구성원이 같은 형식의 본문을
  직접 보내면 공지처럼 보이는 링크가 된다. 링크는 앱 안의 주제 경로로만 이동하고 도착 화면이
  권한을 다시 확인한다. 서버가 공지를 구분하는 값을 계약에 더하고, 앱은 그 값이 있는 메시지만
  링크로 그린다.

(D) 서버·운영(서버 task-16과 homelab 로드맵에서 수행):

- homelab 자동 백업(현재 없음; jamye-server PostgreSQL·MinIO 포함), 서버 README/roadmap drift 정리,
  모니터링·알림 점검(등록)
- Apple 서버 간 알림(server-to-server notifications, consent-revoked) endpoint. 사용자가 Apple ID
  설정에서 앱 연결을 끊어도 지금은 서버가 알 수 없다(M16, 별도 승인).
- Apple 어댑터가 `/auth/token`·`/auth/revoke` 4xx의 Apple `error` 값을 범주형으로 남기게 한다(M16).
- 서버 미디어 어댑터 테스트 fixture가 호스트 `now`와 DB `clock_timestamp()`를 섞어 간헐적으로
  실패한다(`media_uploads_timestamp_check`)(M14).
- 관찰: 카카오·Google로 로그인할 때마다 새 push installation이 생기는지 본다(검증 중 provider별 live
  2개). 원인이 앱 등록 흐름이면 (E)로 옮긴다(M16).

(E) UI/UX·동작 다듬기(app-only):

- 주제 공지(announcement) 메시지의 markdown 링크 원문 렌더와 앱 경로 정리(M14) — 라운드 1 완료.
  서버 형식 하나만 해석해 제목만 링크로 렌더하고 주제 상세로 이동한다. 삭제된 주제의 공지는
  로컬에서 완전히 숨긴다. 이번 업데이트 이전에 이미 삭제된 공지는 로컬에 식별자가 남지 않아
  소급 숨김은 안 된다(한계, [M17 evidence](evidence/M17.md)).
- 업로드가 만료된(1시간 초과) 실패 메시지의 재업로드 또는 버리기(M14) — 라운드 1 완료. 재업로드
  대신 `버리기`로 결정했다(사용자 결정). 실패 행은 이유 문구를 보이고 다시 보내기를 숨긴다.
- 음성을 틀어도 동영상이 멈추지 않는다: 동영상 플레이어와 음성 재생 조정기 연결(M14 품질 정리
  후보) — 라운드 1 완료. 동영상 재생 시작이 재생 조정기에 등록되어 음성·동영상이 서로 멈춘다.
- 새 메시지가 도착할 때 Android 뷰어가 한 번 닫힌 관찰(M14, 원인 미확인) — 라운드 1 완료. focus
  가드, route session id, 동영상 컨트롤 영역 dismiss 제외 세 방어를 추가했다. 기기에서 새 메시지
  수신 중 유지와 닫기 스와이프를 사용자가 확인했다. adb `input swipe`·`motionevent`로는 닫기
  스와이프가 재현되지 않아, 자동 재현 수단은 테스트 인프라 후속으로 남는다.
- 알림 배지: 열린 그룹만 실시간 구독해서 그룹 밖 배지는 그룹을 열 때·푸시·앱 활성화 때만
  반영된다(M15). — 라운드 1 완료. realtime 이벤트, 읽음 처리, 탭 이동, foreground 60초 interval
  네 종류 trigger를 모두 연결했다(500ms debounce, single-flight 중복 방지).
- 삭제 상태 대화방 헤더에 남는 주제 제목, 내 삭제 행 시간 표시의 플랫폼 차이(iOS 없음, Android
  `시간 · 전송됨`), 주제 목록 새로고침의 오프라인 복귀 문구(`입력을 유지했으니…`)(M15 REFINE
  관찰) — 라운드 1 완료. 삭제된 주제 대화방 헤더는 `삭제된 주제`로 고정되고 제목 버튼이 사라진다.
  삭제 행은 플랫폼 공통 규칙으로 시간만 보이고 `전송됨`을 붙이지 않는다. 주제 목록 읽기 실패
  문구는 `주제를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.`로 분리했다.
- M14 라운드 1 잔여: 인증 게이트 라우팅 분리(`(auth)/sign-in`), 그룹 목록을 거치지 않고 연 그룹
  홈의 `그룹` 제목, 날짜 선택 haptics, 그룹 기본 대화방 갤러리, Android carousel `maskClip`, 3열
  grid 타일 모양, iOS 그룹 정보 섹션 헤더, iOS toolbar 강조 버튼 tint(상세는 M14 "라운드 2 또는
  이후 후보") — 라운드 1에서 모두 착수했다. Android carousel 모서리는 축소된 항목이 여전히
  사각으로 잘리는 한계가 남는다(`@expo/ui`에 item-mask API가 없음, 사용자 결정 U7에 따라 한계로
  기록). 그룹 정보(iOS·Android)는 사용자 피드백(U12)으로 `관리` 섹션을 없애고, 그룹 이름 변경은 이름을
  눌러(소유자만 보이는 연필 아이콘) 여는 시트로, 초대 링크 공유는 헤더 오른쪽 위 공유 버튼으로
  옮겼다. 상세는 [M17 evidence](evidence/M17.md).
- (M17 라운드 1, 기기 검증 중 사용자 피드백) iOS 그룹 이름 변경을 새 주제와 같은 C3 `Form`
  시트로 바꿨다(U11, Berry `저장`). 그룹 대화방의 공지 링크로 연 주제 상세는 뒤로 가면 그 주제
  대화방, 다시 뒤로 가면 주제 목록으로 간다(U13).
- (M17 라운드 1) 계정 SQLite 쓰기 연결이 외래 키를 강제하지 않아(expo-sqlite 새 연결 기본값),
  삭제 연쇄가 실행되지 않고 고아 행이 쌓이는 결함을 발견해 마이그레이션 007이 쌓인 고아 행을
  정리하도록 고쳤다(사용자 결정 U10). 쓰기 연결에 외래 키를 강제하는 근본 수정은 쓰기 순서
  점검이 먼저 필요해 후속 과제로 남는다.
- (M17 라운드 1) 에뮬레이터의 세션 복원이 약 6초 걸려 3초 안전 타임아웃이 먼저 지나는 것을
  관찰했다. 복원 로직 자체는 M17 변경 밖이다. 실기기에서 복원 시간을 다시 재고, 필요하면 복원
  중 중립 화면이나 저장 순서 조정을 검토한다.
- (M17 라운드 1) Android에서 녹화한 동영상 업로드가 네이티브 PUT(120초 타임아웃)에서 끝나지
  않아 실패하고 재시도도 실패했다(같은 경로의 사진 업로드는 성공). M17이 바꾸지 않은 경로라
  후속 조사로 남긴다.
- (M17 라운드 1) 뷰어 닫기 버튼 위치가 화면마다 다르다: 갤러리에서 연 사진 뷰어는 닫기가
  오른쪽, 대화방 페이저 뷰어는 닫기가 왼쪽·공유가 오른쪽이다. 기존 동작이며 UX 일관성 후속이다.
- (M17 라운드 1) 주제 목록 전체 화면 오류 상태의 제목과 설명 첫 문장이 같은 문구
  (`주제를 불러오지 못했습니다.`)로 중복된다. 문구 다듬기 후속이다.

(F) 코드 품질·개발 환경(app-only, 동작 불변):

- lint 경고 15건과 media 화면의 eslint 예외(`react-hooks/refs`·immutability)(M14) — 라운드 1
  완료. 전체 lint 경고 0건이고 media 화면의 eslint 예외 블록을 지웠다(Reanimated shared value로
  교체).
- 중복된 player hook, 알림 snackbar host 2개(M14) — 라운드 1 완료. Android player·recorder는
  iOS 구현 재-export로 줄었고, 알림함과 그룹 목록의 Android snackbar host를 각각 하나로 합쳤다.
- 공용 입력 shell 테스트 mock이 `value`를 렌더해 실제 `initialValue` 동작과 어긋난다(M14). —
  라운드 1 완료. mock이 `initialValue` 기반 key remount로 동작한다.
- `auth-controller.ts` 분리(622줄, `createAuthController` 543줄; characterization test 선행)와
  `max-lines-per-function` lint 규칙(M16) — 분리는 라운드 1 완료(622줄 → 319줄, 공개 API 불변,
  6개 내부 module로 분리). `max-lines-per-function` lint 규칙 추가는 이번 라운드에 하지 않아
  남는다.
- Android 에뮬레이터 `default_boot` 스냅샷이 오래된 dev client를 되살리는 문제의 재발 방지 절차
  문서화(M16) — 라운드 1 완료. 절차는 [개발 workflow](development-workflow.md) §5.1에 있다.
- (M17 라운드 1 SHIP 리뷰) 그룹 정보 화면의 확인 대화상자 핸들러(소유권 이전·내보내기·나가기·
  삭제·공유 다시 시도)는 store·hook 단위로만 테스트되고, 화면에서 연결되는 부분은 iOS·Android
  모두 테스트가 없다. 화면 공용 hook `useGroupDetailScreen`이 26개 값을 돌려주므로 역할별
  분리도 함께 검토한다.
- (M17 라운드 1 SHIP 리뷰) `voice-message-bubble.test.tsx` 등 세 테스트가 통과하면서도
  overlapping `act()` 경고를 낸다. 이번 라운드 이전부터 있던 테스트 하네스 잡음으로 보인다.

M18로 보낸 항목: production bundle id의 App ID capability와 .p8 키 Sign in with Apple 설정, 그 점검
순서 문서화(M16, 요구사항 E21). M18 핵심 작업에 있다.

완료 증거:

- 항목별 evidence(자동 검사, 실기기 수용, 운영 확인)
- 라운드 1 (E)·(F): [M17 evidence](evidence/M17.md) — 자동 검사(`bun run check:code`, 246
  suites / 2353 tests, architecture 위반 0건)와 요구사항 §8 1-15 기기 검증.
- 라운드 2 (A): 구현·기기 수용 기록은 [M17 evidence](evidence/M17.md) 라운드 2 절과
  [개발 workflow](development-workflow.md)에 둔다. PR #8(merge `671b649`, 2026-10-06)로 main에
  들어갔다. M17 종료 승인은 없고 M17은 열려 있다.
- 라운드 3 (B): 구현·검증 기록은 [M17 evidence](evidence/M17.md) 라운드 3 절과
  [개발 workflow](development-workflow.md)에 둔다. 서버 쪽은 jamye-server 로드맵 task-19와 배포 기록(PR
  #18, homelab #98·#99)이다. 자동 검사(`check:code` 255 suites / 2,611 tests, `check:expo`),
  시뮬레이터·에뮬레이터 검증, 사용자 본인 계정 아바타 확인, 격리 리뷰 9건 PASS를 마치고 PR #9로 main에
  들어갔다. 2026-10-07 사용자가 라운드 3 종료를 승인했고 M17은 열려 있다.

미검증 / 별도 승인 필요:

- (C)·(D) 항목의 착수 승인. (A)는 2026-10-01 착수를 승인했고(그 안의 Expo SDK patch 갱신은 별도
  의존성 승인) 2026-10-06 구현·기기 수용을 마쳐 PR #8로 머지했다. (B)는 2026-10-06 라운드 3 착수를
  승인했고(파괴적 로컬 정리는 30일 경과 뒤로 한정, Expo patch 정렬·dev client 재빌드·서버 2단계 운영
  배포는 각각 사용자 결정) 2026-10-06~07 구현·검증·격리 리뷰를 마치고 PR #9로 머지해 2026-10-07 라운드
  종료를 승인받았다. (B)의 실기기 확인과 release build cold start 측정은 남아 있다. M17 종료는 별도 사용자 결정이다. (C) 계약 변경, (D) Apple 서버 간
  알림도 각각 별도 승인이다.
- 라운드 1이 남긴 후속 항목(쓰기 연결 FK 강제, 과거 공지 소급 숨김 불가 등 — 위 (E) 목록 참고)은
  각각 별도 결정이 필요하다.

### M18. 스토어 배포 (iOS App Store + Google Play)

- 상태: `planned_unapproved` — 2026-09-22 사용자 결정으로 로드맵 등록; 착수는 M14 만족 선언(2026-09-28
  충족) 이후 별도 승인
- 선행: M14 만족 선언(2026-09-28 충족); M16(Guideline 4.8, 2026-09-30 충족); M17(A) blocker 해소(2026-10-06 구현·기기 수용 완료, PR #8 merge `671b649`; M17 종료 승인은 없음); release에 포함할 M15/M17 범위 확정
- 결정(2026-09-22): iOS App Store와 Google Play 양 스토어에 출시한다. legacy jamye-plz 데이터는
  이관하지 않고 새 서버에서 신규 출발한다. 서버는 이미 homelab(midgard)에 배포되어 있으므로 release 시
  배포 revision과 contract binding을 고정한다.
- 사용자 결과: TestFlight·Play 내부 테스트를 거쳐 양 스토어에서 앱을 설치하고, 심사 통과 후 정식 출시한다.
- 계약 범위: 서버 계약 변경 없음. 배포 revision과 `contract.lock` binding 확인.

핵심 작업:

- production identity의 남은 부분: 아이콘·스플래시. bundle id/package(`com.ridewithmin.jamyeapp`)·앱 이름·
  `app.config.ts`의 `APP_VARIANT=production` 경로는 M17(A)에서 구현했다(빌드·서명은 하지 않음)
- 서명(Apple Distribution/Provisioning, Android keystore) — 사용자가 직접 수행
- 빌드 파이프라인 결정(EAS Build vs 로컬 Xcode/Gradle) — M18 PLAN에서 결정
- Expo push production credential(APNs key, FCM), OAuth 콘솔 production 등록(Kakao/Google/Apple),
  Firebase production client 추가(사용자 작업)
- 서버 AASA/assetlinks 기본값(`DEFAULT_AASA_APP_IDS`·`DEFAULT_ANDROID_PACKAGE`, 지금은
  `dev.local.jamyeapp`)과 Apple audience를 production id로 바꾸는 서버 변경(M17(A)는 서버를 바꾸지 않음)
- release build cold start 측정(M17(A) ANR 분석의 후속, 새 승인 항목)과 SDK 58 업그레이드 시 로컬 iOS
  scene life cycle plugin(`tools/expo/with-ios-scene-lifecycle.cjs`) 제거(iOS 27 SDK는 UIScene 필수)
- M17(A)가 남긴 후속 과제 중 release에 포함할 것을 정한다: F-5 로그인 화면 최대 텍스트 크기 겹침,
  F-6 fail-closed refresh 로그아웃(정상 유휴 뒤에도 관찰), Android snackbar 하단
  정렬·header 제목 글자 크기·composer가 마지막 메시지를 가림·알림함 좁은 본문 열·dev 섹션 겹침(M17
  "(A)에서 M18로 넘긴 항목")
- production bundle id의 Sign in with Apple 설정: App ID capability와 서버 .p8 키의 Sign in with
  Apple service를 둘 다 켠다(M16 기기 검증에서 둘 다 빠져 막혔다, 요구사항 E21). 점검 순서(App ID
  capability → 키 Services → 기기 목록)를 문서로 남긴다.
- 개인정보처리방침·계정 삭제 안내 URL, App Store Connect/Play Console 메타데이터·스크린샷·심사 대응
- rollback preflight([개발 workflow](development-workflow.md) 6.1절)

완료 증거:

- 10.2절 공통 release acceptance 전 항목의 현재 시점 evidence와 스토어 심사 통과

미검증 / 별도 승인 필요:

- 서명·제출·credential 생성은 사용자가 직접 수행([README](../README.md) '배포 경계'); 스토어 계정·비용·
  심사 일정은 이 문서가 약속하지 않는다

## 8. Server API coverage

이 표는 contract inventory의 누락을 막기 위한 배정표다. 현재 구현이나 배포 검증 표가 아니다.

| Family                  | Operation IDs                  | 현재 app                                                                    | Roadmap assignment                         |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------ |
| Health                  | H1, H2                         | 진단 UI 구현                                                                | M6 진단, 공통 release acceptance           |
| OAuth/session           | A1, A2, A3, A4, A5             | M6 범위 구현·세션 수용 완료                                                 | M6 shared session, 공통 release acceptance |
| Profile/account         | U1, U2, U3                     | M13 완료 — U2 닉네임 변경·U3 계정 삭제                                      | M6 U1, M13 U2/U3                           |
| Groups/members          | G1, G2, G3, G4, G5, G6, G7, G8 | M7 완료 — 수용 범위는 evidence 참조                                         | M7                                         |
| Invitations             | I1, I2                         | M7 완료 — 양 플랫폼 사용자 수용                                             | M7                                         |
| Chatrooms/messages/read | C1, C2, C3, C4, C5             | C1-C4 M8 완료 — 양 플랫폼 사용자 수용; C5 대화방 미디어 목록은 M14 라운드 1 | M8, C5는 M14                               |
| Delta/realtime          | S1, R1 + WebSocket             | M9 완료 — 사용자 수용 4/4 확인                                              | M9                                         |
| Topics/tags             | T1, T2, T3, T4, T5, T6, T7     | 완료, 양 플랫폼 사용자 수용 PASS                                            | M10                                        |
| Media                   | MD1, MD2, MD4, MD5             | M11 완료 — 양 플랫폼 사용자 수용                                            | M11                                        |
| Notification history    | N1, N2                         | 완료, iPhone 실기기 사용자 수용 PASS                                        | M12                                        |
| Push installation       | P2, P3, P4                     | 완료, iPhone 실기기 사용자 수용 PASS                                        | M12                                        |

모든 43개 HTTP operation은 위 표에 포함된다. WebSocket은 M9에 배정한다. 2026-09-26 서버
`5b987a2`가 MD3(주제 미디어 목록)를 제거하고 C5(대화방 미디어 목록)를 추가해 operation 수는 43개로
같다. M16(task-app-contract)이 A6(`POST /api/v1/auth/apple/exchange`)을 추가해 44개가 됐다(U3
`DELETE /api/v1/me`는 기존 operation 그대로이고 requestBody만 Apple 계정용으로 조건부 확장). 현재
intake 기준은 서버 `2c93ed1`다(`contracts/server/intake.json`, source_git_revision
`2c93ed1637eb1896d8749ae3d31a287585e38d05`).

다음 operation은 2026-09-22 로드맵 등록 시점에 계약에 없는 **예정 항목(가칭, 계약 미publish)**이다.
이름과 shape는 서버 task-14/task-15가 확정하며, 앱은 publish된 계약을 intake한 뒤에만 구현한다.

| 가칭 ID | 예정 operation                                                             | 확정 주체    | Roadmap assignment |
| ------- | -------------------------------------------------------------------------- | ------------ | ------------------ |
| C6      | `DELETE /api/v1/chatrooms/{chatroom_id}/messages/{message_id}` 메시지 삭제 | 서버 task-14 | M15                |
| T8      | `DELETE /api/v1/groups/{group_id}/topics/{topic_id}` 주제 삭제             | 서버 task-14 | M15                |
| —       | realtime/delta `message.deleted`, `topic.deleted`                          | 서버 task-14 | M15                |
| A6      | `POST /api/v1/auth/apple/exchange` Apple identity token exchange           | 서버 task-15 | M16                |

메시지 삭제의 가칭은 처음 C5였지만 2026-09-26 대화방 미디어 목록이 C5를 쓰게 되어 C6으로 바꿨다.

## 9. 현재 server contract 밖의 backlog

다음 기능은 현재 contract가 확정하지 않으므로 app-only 확정 milestone으로 만들지 않는다.
2026-09-22 로드맵 등록으로 일부 항목은 M15-M18로 옮겼다. 옮긴 항목도 서버 계약 publish와 착수 승인
전에는 `planned_unapproved`다.

| 이전 backlog 항목                                                                                                               | 2026-09-22 이후 위치                           |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Sign in with Apple                                                                                                              | M16(서버 task-15 연동)                         |
| Message delete                                                                                                                  | M15(서버 task-14 연동)                         |
| Message edit                                                                                                                    | M17(C), 서버 task-16 후보                      |
| Presence, typing, reaction                                                                                                      | M17(C), 별도 product decision + 서버 계약 선행 |
| Production signing과 store submission                                                                                           | M18                                            |
| 삭제된 계정의 로컬 SQLite 파일·미디어 캐시 물리 삭제(파괴적 로컬 정리, [ADR 0008](adr/0008-account-lifecycle-placement.md) 6번) | M17(B), 라운드 3 완료(30일 경과 뒤 정리)       |

backlog에 남는 항목:

- 새 OAuth provider(Apple 제외)
- STT와 on-device AI(서버 non-goal D3=C)
- WebPush/VAPID 또는 새 push backend(서버 D2 Expo-only)

필요해지면 product decision, server contract와 별도 milestone plan을 먼저 승인한다.

## 10. 공통 gate

### 10.1 모든 future milestone

각 future milestone은 다음 원칙을 따른다.

- User-visible outcome과 server operation 범위를 PLAN에서 먼저 고정한다.
- Contract, migration, dependency, native config, external data mutation과 production action은 각각
  영향에 맞는 사용자 승인을 받는다.
- App source of truth는 SQLite이고 HTTP cache와 경쟁시키지 않는다.
- Route와 UI는 raw HTTP/WebSocket/SQLite implementation을 직접 소유하지 않는다.
- Security, account isolation, error state, accessibility와 test는 각 task에 포함한다.
- 실행한 static/test/native/runtime/manual evidence와 실행하지 않은 항목을 구분한다.
- Native-affecting 변경만 clean prebuild와 iOS/Android rebuild/install을 요구한다.
- Commit, push, PR, deployment와 destructive cleanup은 milestone completion과 별도 gate다.

### 10.2 Cross-milestone release acceptance

Release acceptance는 M13이나 새 M14가 아니다. Release candidate에 실제로 포함하기로 선택하고
구현한 milestone 범위에만 적용하는 공통 gate다. 다음 항목을 현재 시점의 새 evidence로 확인한다.

- 선택한 범위에 필요한 provider/platform/session matrix
- 선택한 사용자 여정의 automated E2E
- Physical device와 VoiceOver/TalkBack, 200% text, reduce motion 등 접근성 수용
- 과거 M5 advisory를 재사용하지 않는 current dependency audit
- Data shape가 바뀐 경우 migration preservation, backup/restore와 rollback
- 실제 deployment revision과 contract binding
- Production identifier, signing, privacy와 store decision

Media, push 또는 다른 optional milestone을 release에 포함하지 않았다면 이 gate가 그 구현을
요구하지 않는다. External account/data action, signing과 deployment는 계속 별도 사용자 승인이다.

## 11. 문서 변경의 검증 범위

이 로드맵과 [README](../README.md), [제품 의도](product-intent.md),
[개발 workflow](development-workflow.md), [OAuth 개발 연결](oauth-development.md)은
현재 상태와 다음 계획을 함께 설명한다. 과거 milestone evidence는 당시의 기록으로 유지한다.

문서만 변경할 때는 변경 경로, `git diff --check`, Prettier, 기존 architecture checker,
로컬 문서 참조와 위 API 배정표를 확인한다. 이 결과를 test, coverage, dependency audit,
build/prebuild, native generation, 로그인/API smoke 또는 배포 검증으로 표시하지 않는다.
코드·계약·dependency·native 설정 변경의 검증은 개발 workflow의 영향별 기준을 따른다.

## 12. 다음 단계

M6 구현·자동 통합 검사와 요구사항/회귀 리뷰는 통과했다. 의존성 보안 수정과 자동 재검증,
clean prebuild·양 플랫폼 재빌드·설치 이후 [사용자 검증표](oauth-development.md)의
Kakao·Google 실계정 로그인 4개 조합도 모두 통과했다. 이후 양 플랫폼 세션 복원·로그아웃 유지와
Android 취소·Google 재로그인을 확인했다. iOS 취소 후 앱 복귀와 Kakao·Google 재로그인도
사용자가 정상임을 확인하고 종료를 승인하여, 2026-09-09 M6를 정식 종료했다.
Android 시작 ANR은 원인 미확정 상태로 보존하며 실제 만료 갱신과
실계정/origin 변경의 자동 검사·실서버 검증 범위를 혼동하지 않는다.
이후 2026-09-10 사용자가 M7의 양 플랫폼 실서버 그룹 생성·초대·가입·나가기와 계정 전환을
확인하고 종료 기록·로컬 커밋을 승인했다. M7은 `COMPLETED / USER_ACCEPTED`로 정식 종료했다.
이후 서버 C3 수정 배포와 M8 REST 채팅 구현·자동 검사·양 플랫폼 실행을 완료했다.
사용자가 남은 원래 M8 수동 항목도 전부 정상이라고 확인하고 종료 기록과 로컬 커밋을 승인하여,
M8을 `COMPLETED / USER_ACCEPTED`로 정식 종료했다. 상세 결과는 [M8 evidence](evidence/M8.md)를 따른다.
이후 M9 구현·자동 통합 검사·독립 리뷰·양 플랫폼 실행 준비를 마쳤다. 사용자가 안내한 수용
4개 항목이 모두 정상이라고 확인하고 “M9 커밋하고 종료해”라고 승인하여 M9를 정식 종료했다.
상세 결과와 한계는 [M9 evidence](evidence/M9.md)를 따른다. 이후 M10 계획·구현·전체 자동 검사·독립 리뷰와
양 플랫폼 실행을 진행했고 사용자가 네 수용 항목의 정상 동작 및 종료·로컬 커밋을 승인했다.
M10은 `COMPLETED / USER_ACCEPTED`이며 [M10 evidence](evidence/M10.md)에 출처와 한계를 기록한다.
이후 M11 미디어 계획 검토·구현·검증 및 PUT-only native 수정 승인을 받아 전체 coverage·독립 리뷰와 양 플랫폼 재빌드·전송 재검증을 마쳤다.
2026-09-16 사용자 수용과 종료 승인으로 M11을 `COMPLETED / USER_ACCEPTED` 종료했다([M11 evidence](evidence/M11.md)).

각 종료 승인은 후속 milestone 착수, 앱 전체 출시, push 또는 새 배포를 뜻하지 않는다.
이후 M12 알림함·Expo 푸시는 2026-09-21 iPhone 실기기 검증과 사용자 종료 승인으로, M13 프로필 수정과
계정 삭제는 2026-09-22 사용자 디바이스 확인 완료 보고와 종료 승인으로 각각 `COMPLETED / USER_ACCEPTED`
종료했다([M12 evidence](evidence/M12.md), [M13 evidence](evidence/M13.md)). 파괴적 로컬 정리는
M17(B)로 옮겼다.

2026-09-22 사용자는 M13 종료 뒤의 다음 과제 5개를 로드맵에 등록하기로 결정했다: M14 UI/UX
다듬기(native-first 유지, 만족 선언까지 라운드 반복), M15 소프트 삭제 수용(서버 task-14), M16 Sign in
with Apple(iOS native, 서버 task-15), M17 잔여 백로그(네 묶음), M18 스토어 배포(iOS+Android, legacy 이관
없음). M15-M17은 M14 라운드 사이에 병행하고 M18은 M14 만족 선언 이후에만 시작한다. 서버 측 상세는
jamye-server 저장소 로드맵 문서의 task-14-16을 따른다. 이 등록은 구현 승인이 아니다. 라운드 1 범위는 같은 날 고정했다.

2026-09-22 M14 라운드 1 범위 고정: 항목 A(3탭 tab bar)·B(그룹 홈 재구성)·C(라우트 경로 정리), 화면 3개(그룹 목록·그룹 홈·그룹 정보), [ADR 0009](adr/0009-tab-bar-navigation.md)로 ADR 0005 D3 대체, 실행 tracker는 로컬 전용 파일(gitignore 대상인 docs/plans 아래 004-m14-ui-ux-round-1)이다. 이 고정은 구현 승인이 아니다. 착수는 같은 날 사용자가 승인했다.

2026-09-26 M14 라운드 1을 그룹 목록·그룹 상세·주제 목록·주제 상세의 native-first 범위로 확장했고, 서버
task-17 배포(`5b987a2`) 뒤 양 플랫폼 기기 검증을 거쳐 2026-09-27 사용자 종료 선언으로 마쳤다. 같은 날
시작한 라운드 2(로그인·계정·알림·대화방 네이티브 UI, 사진·동영상·음성)는 서버 task-18 배포(`a77cac5`)와
첨부 최대 4개 후속 배포(`c7f71a8`), 양 플랫폼 기기 검증과 결함 24건 수정을 거쳤다. 2026-09-28 사용자가
R4 수정을 확인하고 M14 종료를 승인해 M14는 `COMPLETED / USER_ACCEPTED`다([M14 evidence](evidence/M14.md)).
이 종료 승인도 M15-M18 착수, 앱 출시, push나 새 배포를 뜻하지 않는다.

2026-09-29 사용자가 M15 종료를 승인했다. 서버 task-14 1·2·3차 배포, 앱 계약 v2 intake, 구현, 양
플랫폼 기기 검증(결함 10건 수정)과 격리 리뷰를 마쳤고 PR #2(merge `260e1c1`)로 머지했다. M15는
`COMPLETED / USER_ACCEPTED`다([M15 evidence](evidence/M15.md)). 남은 한계와 후속은 M15 절 "후속
후보"에 있다. 이 종료 승인도 앱 출시, 스토어 배포를 뜻하지 않는다.

2026-09-30 사용자가 M16 종료를 승인했다. 서버 task-15 운영 배포, 앱 계약 intake, 구현, 양 플랫폼
기기 검증(결함 U8·U9 수정, Apple Developer 설정 누락 2건 조치)과 격리 리뷰를 마쳤고 PR #4(merge
`c7b6958`)로 머지했다. M16은 `COMPLETED / USER_ACCEPTED`다([M16 evidence](evidence/M16.md)). 남은
한계와 후속은 M16 절 "후속 후보"에 있다. 이 종료 승인도 앱 출시, 스토어 배포를 뜻하지 않는다.

2026-10-01 사용자가 M17 라운드 1 (E)·(F) 종료를 승인했다. 구현, 양 플랫폼 기기 검증(결함 4건 수정,
사용자 결정 U10-U14)과 격리 리뷰를 마쳤고 PR #6(merge `589c5e0`)으로 머지했다([M17
evidence](evidence/M17.md)). 같은 날 그룹 갤러리 제목을 `갤러리`로 통일했고, 사용자가 M17(A) 착수를
승인했다.

2026-10-06 M17(A)는 구현·기기 수용을 마치고 PR #8(merge `671b649`)로 머지했다. 같은 날 사용자는 M17을
닫지 않고 남은 라운드를 진행하기로 결정했고 (B)를 라운드 3으로 착수했다. 2026-10-06~07 아바타 업로드
(서버 task-19 운영 배포: jamye-server PR #18 merge `f86012e`, homelab #98·#99), 계정 삭제 30일 뒤 로컬 DB
정리, local-fixture/bootstrap 모드 제거와 Expo patch 정렬(B7)을 구현하고 시뮬레이터·에뮬레이터·사용자 본인
계정으로 검증했다(M17 절 "(B) 결과"). 2026-10-07 격리 리뷰를 마치고 PR #9로 머지했고, 사용자가 라운드 3
종료를 승인했다(M17은 열어 둠). 이 승인과 검증은 M17 종료, 앱 출시, 스토어 배포를 뜻하지 않는다.
다음 단계는 남은 묶음 (C)·(D)와 라운드 1·2·3의 후속 항목 중 착수할 것을 사용자가 고르는 일이다. 남은 후보별 선행 조건은 다음과 같다.

- M17 잔여 백로그: 항목별 개별 승인. 2026-09-30에 M14–M16의 후속 후보를 모아 여섯 묶음((A)-(F))으로
  정리했다. (E)·(F)는 라운드 1로 닫았고 (A)는 2026-10-01 착수해 2026-10-06 구현·기기 수용을 마쳐 PR #8로
  머지했다. (B)는 2026-10-06 라운드 3으로 착수해 2026-10-07 구현·검증·격리 리뷰를 마치고 PR #9로
  머지했다(라운드 종료 승인, 파괴적 로컬 정리는 30일 경과 뒤로 한정해 그 요청에서 승인). 서버 계약 변경은 (C), 서버·homelab 작업은
  (D)이며 둘은 `planned_unapproved`다. M18로 가는 선행은 (A)다.
- M18 스토어 배포: M14 만족 선언과 M16 종료(Guideline 4.8)는 충족했다. M17(A)는 PR #8로 머지했고
  release에 포함할 범위 확정과 별도 승인이 남아 있다. production bundle identifier는 M17(A)에서
  `com.ridewithmin.jamyeapp`으로 정했고, 그 App ID·key Sign in with Apple 설정은 M18에서 한다.

M14 종료 뒤 남은 개선 후보는 M14 절의 "M14 종료 후 후속 후보"에 모았다.
