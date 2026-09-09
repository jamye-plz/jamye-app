# jamye-app 서버 계약 기반 로드맵

- 현재 상태: M0-M5 완료 이력 보존, M6 account-safe authenticated shell 구현 및 양 플랫폼 Kakao·Google 실계정 로그인 수용
- 앱 조사 기준점: `ff909de9e43367a17b5c40fb16f64708c34c25ea` (2026-09-09, clean `main...origin/main`)
- 서버 계약 조사 기준점: `7d146ab0040ba49acbc42e40b2408e3e27f6e88d`
- 현재 frontier: M6 구현·자동 통합 검사·보안 패치 검증, 양 플랫폼 재빌드·설치와 로그인 4개 조합 통과; 남은 세션 lifecycle 수용은 별도
- 앱 출시 판정: NOT READY — 원본 감사의 image-size High 2건 추적, 남은 세션 lifecycle 수용과 배포 binding이 남아 있음
- 결정권자: 사용자
- 최종 수정일: 2026-09-09

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
- **미래 계획**: 별도 승인 전에는 구현하지 않는 M6 이후 항목

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
PKCE, SecureStore와 native callback bridge가 추가됐다. `connected-auth` mode에서 현재 이 흐름이
shared session과 U1 profile을 제공하며, M6에는 별도의 health 연결 진단도 있다.

초기 OAuth 수용 이후 M6와 의존성 보안 패치를 포함해 clean iOS/Android rebuild·설치를
다시 완료했다. 2026-09-09 사용자는 현재 빌드에서 양 platform × 양 provider의 실계정 로그인
4개 조합이 모두 성공했다고 확인했다. 에이전트는 iOS Kakao profile/account storage와 앱
재시작 복원을 관찰했다. 자세한 기록은
[OAuth 개발 연결](oauth-development.md)에 있다.

아래 항목은 아직 전체 PASS가 아니다.

- Android 기존 session restore
- 실제 token 만료 뒤 refresh
- logout 후 재실행, browser cancel과 account switch
- 로그인 뒤 group/chat으로 이어지는 navigation
- physical device, VoiceOver/TalkBack, 200% text, reduce motion
- automated mobile E2E와 production 배포 revision binding

따라서 OAuth는 M5에 소급 포함하지 않고, 기존 M6-M8의 완료 근거로도 사용하지 않는다.

### 3.3 현재 실행 경로

현재 app mode는 둘이다.

- `local-fixture`: M5의 SQLite local chat을 표시한다. Network 전송이나 로그인은 없다.
- `connected-auth`: 로그인 선택 또는 profile/logout 화면을 표시한다. 로그인 뒤 group/chat 화면은 없다.

`local-fixture`만 기존 `jamye.db`와 fixture conversation을 사용한다. `connected-auth`는
fixture database/seed를 열지 않고 shared session과 account scope를 사용한다. 계정 namespace는
정규화된 HTTPS origin과 검증된 U1 User UUID의 digest로 분리되며 `scope_metadata` identity를
매번 확인한다. Logout/account switch 뒤 이전 account의 row/outbox/late response가 새 account에
표시·전송되지 않도록 session epoch와 account-scope open/close drain으로 fence한다. cold restore가
검증된 U1 profile을 얻지 못하면 authenticated account data를 표시하지 않는다.

## 4. 서버 계약을 어떻게 사용할 것인가

### 4.1 계약 기준과 provenance

계획 기준은 read-only `jamye-server/contracts/`다.

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

selected completed scopes ─→ common release acceptance
```

M10-M12의 구현 순서는 contract와 제품 우선순위를 다시 확인한 뒤 조정할 수 있다. M13은 M6의
account-safe session을 선행 조건으로 하는 독립 account lifecycle이며 media나 push 완료를 요구하지
않는다. Release acceptance는 번호가 붙은 catch-all milestone이 아니라, 실제 선택·구현한 범위에만
적용하는 공통 gate다.

## 7. 미래 milestone

### M6. 서버 계약 수용과 계정 안전 기반

- 상태: `implemented; automated and patched-security checks passed; native builds and four login combinations passed; remaining session acceptance pending`
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
이 결과로 실제 토큰 만료·refresh, 로그아웃, 취소·오류·계정 전환 수용까지 PASS로 확대하지 않는다.

### M7. 그룹·멤버십·초대

- 상태: `planned_unapproved`
- 선행: M6
- 사용자 결과: group을 만들거나 invite로 참여하고, group 목록·상세·member를 보며 권한에 맞는
  관리 action을 수행한다.
- 계약 범위: Groups/members, Invitations

핵심 작업:

- Group create/list/detail/update/delete와 member list/remove/role update
- Invite 발급·참여와 invalid/expired/full/forbidden/rate/permission 상태
- Membership removal 뒤 protected screen 이탈, subscription/outbox/cache 차단
- Re-fetch와 optimistic UI가 server authority를 덮지 않는 상태 소유권

완료 증거:

- 권한별 happy/error path와 account isolation test
- User-visible loading/empty/retry/destructive confirmation/accessibility state
- 실제 배포 API를 호출하면 test account/data mutation 범위를 사전 승인하고 cleanup 결과 분리

### M8. 실제 서버와 연결한 REST 채팅

- 상태: `planned_unapproved`
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
- SQLite v1을 데이터 삭제 없이 migration하고 local-fixture mode를 보존

완료 증거:

- Contract validator/mapper, pagination, permission/removed membership와 send idempotency test
- Local optimistic message가 exactly one canonical server message로 수렴
- iOS/Android에서 Korean IME, prepend/latest anchor와 error/retry 수동 확인

### M9. 영속 outbox와 실시간·delta 동기화

- 상태: `planned_unapproved`
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

### M10. 주제·태그

- 상태: `planned_unapproved`
- 선행: M7, M9
- 사용자 결과: 날짜별 topic을 보고 생성·상세·수정·tag 관리 후 topic chatroom에 들어간다.
- 계약 범위: Topics/tags와 `topic.created`

핵심 작업:

- Date/list/create/detail/update/tag replace/list
- `topic.created`를 M9의 same validator/checkpoint/recovery 경계에 연결
- Group main room과 topic room navigation, stale group/account result 차단

완료 증거:

- Date/list/detail 일관성, permission/error와 realtime/delta recovery test
- 생성된 topic과 chatroom으로의 user-visible navigation

### M11. 미디어 업로드·첨부·접근

- 상태: `planned_unapproved`
- 선행: M8, M10
- 사용자 결과: 지원하는 media를 선택해 upload를 완료하고 contract가 허용하는 message/topic에
  연결하며, 이후 안전하게 열거나 내려받는다.
- 계약 범위: Media

핵심 작업:

- Presigned upload create/finalize, topic media list와 media URL/download
- System picker 우선, permission은 기능 사용 시점에 요청
- Signed URL 전체를 그대로 사용하고 API credential을 media host에 전달하지 않음
- Expiry, retry, cancellation, duplicate finalize와 partial upload cleanup

완료 증거:

- Contract/content validation, credential isolation과 failure recovery test
- 선택한 platform/device의 picker, upload, render/download와 접근성 수동 결과

### M12. 알림함과 Expo 푸시

- 상태: `planned_unapproved`
- 선행: M6, M7, M10
- 사용자 결과: Notification history를 읽고 read 처리하며, 동의한 device에서 받은 push로 올바른
  authenticated destination에 진입한다.
- 계약 범위: Notification history와 Push installation

핵심 작업:

- Structured notification `type`과 `args`를 local copy로 안전하게 rendering
- Read state와 destination authorization/revalidation
- Expo token register/update/delete와 login/logout/account/device lifecycle
- Permission denied, token rotation과 stale installation cleanup

완료 증거:

- History/read/deep-link/authorization test
- Provider `expo`, platform `ios`/`android` request validation
- Registration API test와 실제 receipt/delivery/physical-device evidence를 분리

### M13. 프로필 수정과 계정 삭제

- 상태: `planned_unapproved`
- 선행: M6
- 사용자 결과: Profile을 갱신하고 account 삭제를 안전하게 요청하며, 삭제된 identity가 active
  local session이나 stale data로 남지 않는다.
- 계약 범위: Profile update와 account deletion

핵심 작업:

- Profile update와 destructive account deletion confirmation/blocker 처리
- Delete/logout 뒤 token과 session을 제거하고, 실제 구현돼 있는 cache, SQLite namespace, outbox,
  subscription, media 또는 push installation scope를 정리하거나 안전하게 격리
- 아직 구현하지 않은 media/push milestone을 account update/delete의 선행 조건으로 요구하지 않음
- Partial failure, retry와 재로그인 시 삭제된/stale account state 재활성화 방지

완료 증거:

- Profile update의 validation/error/success와 persisted identity refresh test
- Account deletion confirmation, server blocker/error, retry와 실제 구현된 local scope cleanup test
- 실제 account 삭제와 destructive local cleanup은 각각 별도 명시 승인

## 8. Server API coverage

이 표는 contract inventory의 누락을 막기 위한 배정표다. 현재 구현이나 배포 검증 표가 아니다.

| Family                  | Operation IDs                  | 현재 app                               | Roadmap assignment                            |
| ----------------------- | ------------------------------ | -------------------------------------- | --------------------------------------------- |
| Health                  | H1, H2                         | 진단 UI 구현                           | M6 진단, 공통 release acceptance              |
| OAuth/session           | A1, A2, A3, A4, A5             | 구현·양 플랫폼 양 provider 로그인 수용 | M6 shared session과 남은 lifecycle acceptance |
| Profile/account         | U1, U2, U3                     | U1 표시만                              | M6 U1, M13 U2/U3                              |
| Groups/members          | G1, G2, G3, G4, G5, G6, G7, G8 | 없음                                   | M7                                            |
| Invitations             | I1, I2                         | 없음                                   | M7                                            |
| Chatrooms/messages/read | C1, C2, C3, C4                 | local fixture만                        | M8                                            |
| Delta/realtime          | S1, R1 + WebSocket             | 실행 경로 없음                         | M9                                            |
| Topics/tags             | T1, T2, T3, T4, T5, T6, T7     | 없음                                   | M10                                           |
| Media                   | MD1, MD2, MD3, MD4, MD5        | 없음                                   | M11                                           |
| Notification history    | N1, N2                         | 없음                                   | M12                                           |
| Push installation       | P2, P3, P4                     | 없음                                   | M12                                           |

모든 43개 HTTP operation은 위 표에 포함된다. WebSocket은 M9에 배정한다.

## 9. 현재 server contract 밖의 backlog

다음 기능은 현재 contract가 확정하지 않으므로 app-only 확정 milestone으로 만들지 않는다.

- Sign in with Apple 또는 새 OAuth provider
- STT와 on-device AI
- Presence, typing, reaction
- Message edit/delete
- WebPush/VAPID 또는 새 push backend
- Production signing과 store submission — 공통 release acceptance의 별도 사용자 결정

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
현재 상태와 다음 계획을 함께 설명한다. M1-M5 evidence는 당시의 기록으로 유지한다.

문서만 변경할 때는 변경 경로, `git diff --check`, Prettier, 기존 architecture checker,
로컬 문서 참조와 위 API 배정표를 확인한다. 이 결과를 test, coverage, dependency audit,
build/prebuild, native generation, 로그인/API smoke 또는 배포 검증으로 표시하지 않는다.
코드·계약·dependency·native 설정 변경의 검증은 개발 workflow의 영향별 기준을 따른다.

## 12. 다음 단계

M6 구현·자동 통합 검사와 요구사항/회귀 리뷰는 통과했다. 의존성 보안 수정과 자동 재검증,
clean prebuild·양 플랫폼 재빌드·설치 이후 [사용자 검증표](oauth-development.md)의
Kakao·Google 실계정 로그인 4개 조합도 모두 통과했다. 현재 결과를 기록한 뒤 남은
복원·로그아웃·실제 토큰 만료 갱신·취소·계정 전환 수용 범위를 사용자와 확인한다.
로그인 성공만으로 이 항목이나 M6 전체 종료를 추론하지 않는다.
M6 종료를 확인한 뒤 다음 기능 후보인 **M7 그룹·멤버십·초대**를 계획한다. M7-M13은 아직 구현하지 않았다.

문서 갱신은 앱 기능 완료, 출시 승인, commit/push 또는 배포를 뜻하지 않는다.
