# jamye-app 서버 계약 기반 로드맵

- 현재 상태: M0-M5 완료 이력 보존, M6 계정 안전 기반, M7 그룹·멤버십·초대, M8 REST 채팅, M9 영속 outbox·실시간/delta 동기화, M10 주제·태그 완료 (2026-09-10 M10 사용자 종료 승인), M11 미디어 업로드·첨부·접근 완료 (2026-09-16 M11 사용자 종료 승인), M12 알림함·Expo 푸시 완료 (2026-09-21 M12 사용자 종료 승인), M13 프로필 수정·계정 삭제 완료 (2026-09-22 M13 사용자 종료 승인)
- 앱 조사 기준점: `ff909de9e43367a17b5c40fb16f64708c34c25ea` (2026-09-09, clean `main...origin/main`)
- 서버 계약 조사 기준점: `7d146ab0040ba49acbc42e40b2408e3e27f6e88d`
- 현재 frontier: M13 프로필 수정과 계정 삭제 `COMPLETED / USER_ACCEPTED` (2026-09-22 사용자 디바이스 검증 완료 보고 및 종료 승인). 다음 milestone은 미정이며 사용자 결정으로 시작한다. 파괴적 로컬 정리는 여전히 별도 승인 대상.
- 앱 출시 판정: NOT READY — 원본 감사의 image-size High 2건·Android 시작 ANR 추적, 출시 범위의 실기기·E2E 수용과 배포 binding이 남아 있음
- 결정권자: 사용자
- 최종 수정일: 2026-09-22

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
- **현재 구현 증거**: M10 전체 자동 검사·독립 리뷰 PASS, 양 플랫폼 사용자 수용 4/4 및 종료 승인. M11은 2026-09-15 expo-image·expo-video 포함 양 플랫폼 clean prebuild·재빌드·설치, 포스터 송수신·realtime 반영 검증(전체 129 suites / 1,370 tests PASS)을 거쳐 2026-09-16 사용자 종료 승인. 기존 PUT-only native·picker 생명주기 리뷰 이력은 보존. M12는 2026-09-16 전체 자동 검사(145 suites / 1,573 tests PASS, coverage 87.37%/82.48%/88.31%/90.22%)와 독립 리뷰 3건(Alignment/Safety/Regression) PASS를 거쳤고, 2026-09-20~21 재빌드(Android 에뮬레이터·iOS 시뮬레이터·iPhone 15 Pro 실기기)와 실기기 푸시 수신·탭 handoff·미리보기 off·기본 대화방 알림 검증(서버 PR #6·#7 배포 포함)을 거쳐 2026-09-21 사용자 종료 승인([M12 evidence](evidence/M12.md))
- **미래 계획**: M13 이후 항목은 `planned_unapproved`; M12 구현 승인이 후속 범위 승인은 아님

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

현재 app mode는 둘이다.

- `local-fixture`: M5의 SQLite local chat을 표시한다. Network 전송이나 로그인은 없다.
- `connected-auth`: 로그인 선택 또는 profile/logout 화면에서 그룹으로 이동하고, 주제 목록·메시지
  조회·텍스트 전송·수동 재시도·내 읽음 위치 저장을 사용한다. M9의 실시간·delta 복구를 재사용하며
  M10은 날짜별 주제 생성·상세·제목/본문·태그 관리와 해당 주제 대화 진입을 추가했고 양 플랫폼 사용자 수용을 마쳤다.

`local-fixture`만 기존 `jamye.db`와 fixture conversation을 사용한다. `connected-auth`는
fixture database/seed를 열지 않고 shared session과 account scope를 사용한다. 계정 namespace는
정규화된 HTTPS origin과 검증된 U1 User UUID의 digest로 분리되며 `scope_metadata` identity를
매번 확인한다. Logout/account switch 뒤 이전 account의 row/outbox/late response가 새 account에
표시·전송되지 않도록 session epoch와 account-scope open/close drain으로 fence한다. cold restore가
검증된 U1 profile을 얻지 못하면 authenticated account data를 표시하지 않는다.

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
- SQLite v1을 데이터 삭제 없이 migration하고 local-fixture mode를 보존

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
  `expo run:ios`(시뮬레이터) + `expo run:ios --device heimdall`(iPhone 15 Pro) 재빌드·설치.
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
- iOS/Android 디바이스 실행 검증과 사용자 종료 승인 대기(표는 [M13 evidence](evidence/M13.md) 참고)

## 8. Server API coverage

이 표는 contract inventory의 누락을 막기 위한 배정표다. 현재 구현이나 배포 검증 표가 아니다.

| Family                  | Operation IDs                  | 현재 app                             | Roadmap assignment                         |
| ----------------------- | ------------------------------ | ------------------------------------ | ------------------------------------------ |
| Health                  | H1, H2                         | 진단 UI 구현                         | M6 진단, 공통 release acceptance           |
| OAuth/session           | A1, A2, A3, A4, A5             | M6 범위 구현·세션 수용 완료          | M6 shared session, 공통 release acceptance |
| Profile/account         | U1, U2, U3                     | U1 표시만                            | M6 U1, M13 U2/U3                           |
| Groups/members          | G1, G2, G3, G4, G5, G6, G7, G8 | M7 완료 — 수용 범위는 evidence 참조  | M7                                         |
| Invitations             | I1, I2                         | M7 완료 — 양 플랫폼 사용자 수용      | M7                                         |
| Chatrooms/messages/read | C1, C2, C3, C4                 | M8 완료 — 양 플랫폼 사용자 수용      | M8                                         |
| Delta/realtime          | S1, R1 + WebSocket             | M9 완료 — 사용자 수용 4/4 확인       | M9                                         |
| Topics/tags             | T1, T2, T3, T4, T5, T6, T7     | 완료, 양 플랫폼 사용자 수용 PASS     | M10                                        |
| Media                   | MD1, MD2, MD3, MD4, MD5        | 자동 검사 PASS, native 업로드 보류   | M11                                        |
| Notification history    | N1, N2                         | 완료, iPhone 실기기 사용자 수용 PASS | M12                                        |
| Push installation       | P2, P3, P4                     | 완료, iPhone 실기기 사용자 수용 PASS | M12                                        |

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
실제 사용자 미디어 수용과 M11 종료는 남아 있다. [M11 evidence](evidence/M11.md)에 구분해 기록한다.

이번 종료 승인은 M11 구현, 기존 후속 마일스톤 변경, 앱 전체 출시, push 또는 새 배포를 뜻하지 않는다.
