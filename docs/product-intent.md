# 잼얘좀 모바일 — 서버 연결 제품 여정과 보존할 native 의도

- 작성 목적: M1에서 기존 `jamye-plz`의 제품 의미와 회귀 의도를 읽기 전용으로 추출
- 현재 구현 범위: M0-M5 local fixture chat foundation, M6 account-safe authenticated shell, M7 group journey, M8 REST chat, M9 durable outbox/realtime/delta, M10 topics/tags, M11 media (2026-09-16 사용자 수용·종료 승인), M12 notification/Expo push (2026-09-21 사용자 수용·종료 승인)
- M5 이후: Kakao/Google login/profile/logout과 M6 범위의 native/user 세션 수용 완료
- 현재 frontier: M12 completed / user accepted (2026-09-21); M13 profile update/account deletion planned_unapproved
- 기준 저장소: [sibling `jamye-plz`](../../jamye-plz/) repository (수정하지 않음)

## 1. 먼저 고정할 해석 원칙

기존 PWA는 제품 의도를 알려 주는 참고자료이지 새 모바일 앱의 기술 계약이 아니다.
브라우저 인증, 기존 REST 경로, 기존 WebSocket 프레임, Svelte 컴포넌트 구조는 그대로
이식하지 않는다. 모바일용 wire contract와 SQLite schema는 M4에서 별도로 제안하고
사용자 승인을 받은 뒤 고정한다.

이번 수직 절편은 다음 경계를 지킨다.

- `local-fixture` mode는 고정 fixture 사용자와 대화방을, `connected-auth` mode는 shared
  OAuth session, 검증된 U1 profile, logout과 account-safe home, M7 group journey 및 M8 REST chat을 표시한다.
  그룹에서 주제 목록·메시지 조회·텍스트 전송·수동 재시도·내 읽음 위치 저장으로 이동하며
  M9의 자동 outbox와 실시간·delta 복구를 사용한다.
- 인증 mode는 M5 `jamye.db` fixture와 seed를 사용하지 않는다. API origin과 검증된 User UUID를
  함께 digest한 account namespace와 `scope_metadata` identity를 사용하며, 이전 account의
  늦은 응답·open/close 작업이 새 account에 노출되지 않도록 session epoch와 scope drain으로
  fence한다. 유효한 profile 없는 cold restore는 authenticated account data를 표시하지 않는다.
- 화면의 메시지 원본은 SQLite뿐이다. HTTP cache나 메모리 배열을 경쟁 원본으로 두지 않는다.
- M11은 서버가 확정한 미디어 첨부까지 기존 메시지/outbox 경로에 연결한다. 파일 업로드는 foreground에서 완료하고,
  완료 전 첨부를 전송 의도로 저장하지 않는다. Native·사용자 수용은 [M11 evidence](evidence/M11.md)에서 별도로 판정한다.
- 전송 버튼을 누르면 optimistic message와 outbox command를 하나의 transaction으로 만든다.
- M5는 오프라인 전송 의도를 기기에 남긴다. 재시작·재연결 뒤 같은 `client_msg_id`로
  canonical message 하나에 수렴시키는 processor는 M9에서 구현·수용했다.
- M9는 realtime event 누락을 S1 delta sync로 복구하며 화면의 SQLite 원본 경계를 유지한다.
- composer에서 Enter는 줄바꿈이고, 명시적인 버튼만 전송한다. 한국어 IME 조합 중에는
  전송 동작이 발생하지 않아야 한다.

장기 제품에는 그룹 메인방과 주제별 방이 모두 있다. 현재는 fixture 대화방 하나로 채팅의
신뢰성을 검증했고 M6 계정 안전 기반, M7 그룹 여정, M8 REST 채팅과 M9 동기화도 종료했다.
앱의 사용자용 chatroom 명칭은 '주제'이며 main room은 '기본 주제'로 표시한다.
API의 `chatroom`/`topic` 식별자는 유지한다. 다음 사용자 여정은 [로드맵](roadmap.md)의 M10 이후 순서를 따른다.

### 1.2 현재에서 미래로 이어지는 사용자 여정

다음 순서는 제품 결과를 기준으로 한 계획이며, 문서 승인만으로 구현·배포가 허가되는 것은
아니다. 각 wire shape의 권위는 기존 PWA가 아니라 계획에 사용하는 읽기 전용
`jamye-server/contracts` snapshot이다. Native interaction intent는 M5의 원칙을 이어간다.

1. Login 후 account-safe home — M6 완료
2. Group 생성·참여와 membership — M7 완료, 양 플랫폼 그룹 작업·계정 전환 사용자 확인
3. 실제 chatroom history/read/send — M8 완료, 양 플랫폼 사용자 확인
4. Offline/realtime convergence — M9 완료, 사용자 수용 4/4 확인
5. Topics/tags — M10 완료, 양 플랫폼 사용자 수용 4/4 확인 및 종료 승인
6. Media — M11 완료, 2026-09-16 양 플랫폼 사용자 수용 및 종료 승인
7. Notification/Expo push — M12 완료, 2026-09-21 iPhone 실기기 수용 및 종료 승인
8. Account profile update와 deletion lifecycle

2026-09-10 사용자가 [M10 계획](roadmap.md#m10-주제태그)의 범위와 순서를 확정했다.
서울 날짜 기준 주제 조회·제목으로 생성·상세·작성자의 제목/본문 수정·작성자 또는 소유자의
태그 관리 후 기존 대화 화면으로 이동한다. 새 주제 발견과 목록 복구는 M9 경계에 연결한다.
메시지별 상대방 읽음 표시와 주제별 안읽음 배지, AI 태그 생성, 오프라인 주제 생성 예약은
추가하지 않으며 M11-M13도 유지한다. 이후 별도 구현 승인으로 T1-T7·계정 캐시·화면·동기화 연결을 구현했다.
전체 자동 검사 76 suites / 902 tests와 독립 리뷰·수정 재리뷰를 통과했다. 기존 양 플랫폼 설치본에서
최신 번들로 세션 복원·주제 조회·작성 화면·앱 복귀를 관찰했다. 이어 사용자가 실제 생성·편집·다른 계정
동기화 등 네 항목을 양 플랫폼에서 정상으로 확인하고 종료를 승인해 M10을 정식 종료했다.
에이전트 관찰과 사용자 보고는 [M10 evidence](evidence/M10.md)에 구분하며, 앱 전체 출시 판정은 별도다.

Release-facing provider/platform/session matrix, E2E, physical-device/accessibility, current
dependency audit, migration/rollback, deployment binding과 signing/store decision은 특정
milestone에 자동 포함하지 않는다. 선택·구현한 범위에만 적용하는 공통 release acceptance를
로드맵에서 별도 gate로 판정한다.

## 2. 필수 참고자료 확인표

| 참고자료                                                                                                             | 이번 문서에 남긴 의도                                                                              |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`docs/product/vision-and-scope.md`](../../jamye-plz/docs/product/vision-and-scope.md)                               | 주제는 대화를 여는 시드이고 제품의 본체는 친한 사람끼리 이어 가는 대화라는 의미                    |
| [`docs/product/features.md`](../../jamye-plz/docs/product/features.md)                                               | 실시간 대화, history, optimistic send, `client_msg_id` 멱등성                                      |
| [`docs/product/design-context.md`](../../jamye-plz/docs/product/design-context.md)                                   | scroll anchor, IME, keyboard settled state, safe area, 접근성, 절제된 파스텔 분위기                |
| [`DESIGN.md`](../DESIGN.md)                                                                                          | 대화 폭, bubble, composer, 상태 표현에 필요한 semantic design 값                                   |
| [`docs/architecture/api-contract.md`](../../jamye-plz/docs/architecture/api-contract.md)                             | 기존 transport 자체가 아니라 멱등 전송, canonical 확인, history gap 복구라는 불변 조건             |
| [`frontend/src/routes/`](../../jamye-plz/frontend/src/routes/)                                                       | 기존 제품의 채팅 진입 구조와 장기적으로 여러 방이 존재한다는 근거                                  |
| [`frontend/src/lib/components/ChatRoom.svelte`](../../jamye-plz/frontend/src/lib/components/ChatRoom.svelte)         | 메시지 목록, connection state, optimistic reconciliation, reconnect 시 history 보존, scroll anchor |
| [`frontend/src/lib/components/ChatComposer.svelte`](../../jamye-plz/frontend/src/lib/components/ChatComposer.svelte) | IME-safe 입력, multiline 성장, 명시적 전송 control, 접근성 이름                                    |
| [`frontend/src/lib/api/`](../../jamye-plz/frontend/src/lib/api/)                                                     | UI와 transport를 분리해야 한다는 경계 및 기존 history/retry 의도                                   |
| [`frontend/tests/`](../../jamye-plz/frontend/tests/)                                                                 | spacing, reconnect recovery, semantic size, route focus 회귀 의도                                  |

확인한 inventory는 route 파일 15개, API 파일 8개, test 파일 8개다. 각 범주의 현재 범위와
backlog 구분은 §7에 기록했다.

## 3. 보존할 제품 의미

### 3.1 대화가 제품의 본체다

[`docs/product/vision-and-scope.md`](../../jamye-plz/docs/product/vision-and-scope.md)는 주제를 완성된 게시물보다 대화를 시작하는 시드로
정의한다. 따라서 모바일 채팅 화면의 우선순위는 화려한 콘텐츠 카드가 아니라 다음에 있다.

- 한마디를 부담 없이 남길 수 있을 것
- 새 메시지가 즉시 보일 것
- 끊김이나 앱 종료 때문에 사용자의 전송 의도가 사라지지 않을 것
- 긴 대화를 읽던 위치와 흐름이 안정적으로 유지될 것

폐쇄 그룹, seed에서 enriched로 이어지는 주제, 그룹 메인방과 주제별 방은 이 제품 의미의
장기 구조다. 현재 한 방짜리 fixture는 이 구조를 축소 구현한 것이 아니라, 채팅 신뢰성을
먼저 검증하기 위한 독립된 시험면이다.

### 3.2 전송은 즉시 보이면서도 결국 하나여야 한다

[`docs/product/features.md`](../../jamye-plz/docs/product/features.md),
[`docs/architecture/api-contract.md`](../../jamye-plz/docs/architecture/api-contract.md),
[`ChatRoom.svelte`](../../jamye-plz/frontend/src/lib/components/ChatRoom.svelte)에서 공통으로 확인되는 핵심은 optimistic send와 `client_msg_id` 기반
reconciliation이다. 새 앱에서는 이를 offline-first 방식으로 강화한다.

1. **M5 완료:** 사용자가 전송 버튼을 누른다.
2. **M5 완료:** SQLite transaction 하나가 pending message와 outbox command를 함께 기록한다.
3. **M5 완료:** 화면은 SQLite 변경을 구독해 메시지를 즉시 표시한다.
4. **M8 완료:** 명시적 전송·수동 재시도가 실제 chatroom REST command를 같은 `client_msg_id`로 보낸다.
5. **M9 목표:** REST response, realtime event, delta response는 같은 idempotent apply 경로를 쓴다.
6. **M9 목표:** canonical event가 optimistic row를 sent 상태로 수렴시킨다.

M5는 local failed row 재시도에서 기존 message와 outbox identity를 재사용하는 데까지 구현했다.
M8은 REST 전송·수동 재시도의 server canonical message 수렴을 구현·검증했다.
재연결·재시작 뒤 자동 전송과 event/delta 수렴은 M9에 남는다.

### 3.3 M9 realtime은 진실의 근거가 아니다

기존 `chat-socket-reconnect.test.mjs`는 reconnect, 중복 event, history gap, 늦게 도착한
결과가 현재 화면을 오염시키지 않아야 한다는 회귀 의도를 제공한다. 새 앱은 기존 소켓
구현을 복사하지 않고 다음 모바일 규칙으로 번역한다. 아래 항목은 M9의 목표 계약이며,
M5에는 WebSocket·REST delta·network lifecycle 실행 경로가 없다.

- WebSocket은 이미 확정된 event를 빠르게 받는 통로다.
- REST delta sync가 event 누락과 reconnect race를 복구한다.
- REST와 WebSocket event는 동일한 검증과 apply 경로를 지난다.
- `event_id` 중복과 cursor 역행을 저장 계층에서 막는다.
- foreground 복귀, network regain, reconnect 때 delta sync를 요청한다.
- room 또는 화면이 바뀐 뒤 도착한 오래된 비동기 결과는 현재 상태에 적용하지 않는다.

M8 당시 transport는 M6 OAuth/profile/logout·health, M7 groups와 REST chat까지였다. 기존 PWA의
cookie, endpoint, socket frame은 모바일 계약으로 사용하지 않는다. 이후 WebSocket/delta와
자동 outbox dispatch는 M9에서 완료했고, media는 M11에서 native 업로드 문제를 해결하고 2026-09-16 사용자 수용을 마쳤다.
Push와 offline authenticated restore는 아직 구현하지 않았다.

### 3.4 읽던 위치를 잃지 않는다

[`docs/product/design-context.md`](../../jamye-plz/docs/product/design-context.md),
[`ChatRoom.svelte`](../../jamye-plz/frontend/src/lib/components/ChatRoom.svelte), 기존 reconnect test는 대화 흐름의
안정성을 반복해서 요구한다.

- 처음 진입할 때 선택한 mode의 SQLite 메시지를 읽는다. Connected mode는 account-scoped 저장소를 사용한다.
- 과거 page를 앞에 추가해도 사용자가 보던 첫 visible message의 위치를 유지한다.
- **M9 목표:** reconnect나 delta sync 때문에 이미 읽고 있던 목록을 비우지 않는다.
- 새 메시지가 도착했다고 사용자가 과거를 읽는 중인 화면을 강제로 맨 아래로 이동시키지
  않는다.
- virtualization의 row key는 optimistic 상태에서 canonical 상태로 바뀌어도 불필요한
  재마운트와 위치 점프를 만들지 않는다.

M5는 virtualized list의 prepend anchor, committed local target reveal과 native keyboard
progress 기반 bottom anchoring을 구현·검증했다. 상세 판정은 [M5 실행 증거](evidence/M5.md)에
기록한다.

### 3.5 입력은 한국어 조합과 키보드를 우선한다

[`ChatComposer.svelte`](../../jamye-plz/frontend/src/lib/components/ChatComposer.svelte)와
[`docs/product/design-context.md`](../../jamye-plz/docs/product/design-context.md)에서 보존할 핵심은 특정 웹 event
코드가 아니라 조합 중인 입력을 훼손하지 않는다는 결과다.

- 여러 줄 입력이 자연스럽게 늘어나되 화면을 과도하게 덮지 않는다.
- 조합 시작부터 확정까지 draft를 임의로 전송하거나 초기화하지 않는다.
- 이번 정책에서는 Enter가 줄바꿈이며 전송은 접근 가능한 버튼으로만 한다.
- iOS와 Android의 keyboard, safe area 차이는 작은 platform adapter로 격리한다.
- keyboard의 native 진행률과 같은 프레임에서 composer와 마지막 message가 함께 이동하고,
  정착 뒤에도 마지막 message가 composer 바로 위에 보이도록 한다.
- 전송 뒤 keyboard focus를 유지하고 새로 commit된 local message를 현재 keyboard viewport에
  표시한다.

## 4. semantic design intent

`DESIGN.md`의 값은 의미를 보존하되 Tailwind, daisyUI, Svelte, CSS 구현은 옮기지 않는다.
React Native의 semantic token과 platform API로 다시 표현한다.

### 4.1 분위기와 색 역할

- 친한 사람끼리 쓰는 따뜻하고 장난스러운 파스텔 분위기를 유지한다.
- 장시간 읽는 채팅에서는 장식보다 가독성과 안정성을 우선한다.
- outgoing bubble은 berry 계열의 primary 역할, incoming bubble은 neutral raised-surface
  역할을 사용한다.
- light와 dark palette를 각각 설계하며 단순 반전하지 않는다.
- pending, failed, sent 상태는 색만으로 구분하지 않고 텍스트와 접근성 설명을 함께 쓴다.

### 4.2 대화 목록

| 의미                               |                                     보존할 값 |
| ---------------------------------- | --------------------------------------------: |
| 읽기 좋은 대화 column의 최대 폭    | 720px 상당, 작은 화면에서는 가용 폭 전체 사용 |
| message 본문                       |                   최소 16px, line height 1.55 |
| bubble 기본 모서리                 |                                          20px |
| 방향을 보조하는 한쪽 모서리        |                                           8px |
| bubble 최대 폭                     |                     mobile 78%, 넓은 화면 66% |
| 같은 발신자 연속 message 간격      |                                           4px |
| 발신자 또는 minute group 변경 간격 |                                          12px |
| timestamp                          |               13px, 같은 minute run마다 한 번 |

방향은 정렬, 모서리, 접근성 정보로 함께 전달한다. 새 메시지의 appearance 효과가 있더라도
상태 반영과 scroll anchor를 지연하지 않으며 reduce motion에서는 즉시 표시한다.

### 4.3 composer와 control

| 의미                        |                                          보존할 값 |
| --------------------------- | -------------------------------------------------: |
| textarea 최소 높이          |                                               48px |
| textarea 성장 상한          | 120px 상당, dynamic text에 맞게 의미 기반으로 조정 |
| 입력 field 모서리           |                                               16px |
| icon button 최소 hit target |                                            44×44px |
| 짧은 press feedback         |                       최대 150ms, layout 이동 없음 |

현재 slice에는 text input과 send button만 있다. media, microphone, recording state는
composer에 자리만 예약하거나 skeleton을 만들지 않고 backlog로 남긴다. composer는 bottom
safe area를 소유하고 마지막 message를 가리지 않아야 한다.

### 4.4 접근성과 platform 적응

- M5의 읽기 순서는 app heading, local fixture notice, message list, composer, send action 순으로
  이해 가능해야 한다. Connection state가 도입되는 M9에서는 app bar 다음 위치를 별도 검증한다.
- message list, input, send button에는 역할에 맞는 접근성 이름을 제공한다.
- connection과 전송 상태는 live announcement가 과도하게 반복되지 않도록 설계한다.
- dynamic text 200%, dark mode, reduce motion에서도 message 내용과 상태 및 전송 control을
  사용할 수 있어야 한다.
- iOS HIG와 Android Material의 기본 동작을 존중하며 두 플랫폼의 pixel 일치를 목표로
  삼지 않는다.

## 5. 현재 slice에서 검토할 한국어 copy

아래 문자열은 기존 제품 copy의 후보 목록이다. M5의 채택·변경·보류 판정과 실제 추가 문구는
[M5 실행 증거](evidence/M5.md)에 고정한다.

| 문자열                       | 용도                              | 출처                  |
| ---------------------------- | --------------------------------- | --------------------- |
| `연결됨`                     | steady connection state           | `ChatRoom.svelte`     |
| `다시 연결하는 중`           | reconnect state                   | `ChatRoom.svelte`     |
| `연결 중`                    | initial connection state          | `ChatRoom.svelte`     |
| `연결이 끊겼어요`            | disconnected state                | `ChatRoom.svelte`     |
| `다시 시도`                  | reconnect retry action            | `ChatRoom.svelte`     |
| `이전 메시지 불러오는 중...` | older history loading             | `ChatRoom.svelte`     |
| `불러오는 중...`             | initial loading                   | `ChatRoom.svelte`     |
| `첫 메시지를 남겨보세요`     | empty conversation                | `ChatRoom.svelte`     |
| `전송 중`                    | pending message                   | `ChatRoom.svelte`     |
| `채팅 메시지`                | message region accessibility name | `ChatRoom.svelte`     |
| `메시지 입력...`             | composer placeholder              | `ChatComposer.svelte` |
| `메시지 입력`                | input accessibility name          | `ChatComposer.svelte` |
| `메시지 보내기`              | send button accessibility name    | `ChatComposer.svelte` |
| `뒤로 가기`                  | navigation accessibility name     | `ChatRoom.svelte`     |

기존 PWA에서 연결 단절을 전송 실패로 안내하던 문구는 offline outbox 동작과 맞지 않으므로
그대로 재사용하지 않는다. M5는 local row 상태를 `전송 중`, `전송 실패`, `전송됨`으로
구분하고, 연결·reconnect copy는 실제 transport 상태가 생기는 M9로 보류했다.

## 6. 기존 구현과 test에서 가져올 회귀 의도

| 기존 근거                        | 새 앱에 번역할 회귀 의도                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ChatRoom.svelte`                | 목록을 비우지 않는 reconnect, optimistic reconciliation, loading·empty·connection 상태, scroll anchor |
| `ChatComposer.svelte`            | IME 조합 보존, multiline growth, 명시적 send action, 접근성 이름                                      |
| `chat-room-spacing.test.mjs`     | 같은 발신자와 새 group의 간격 차이가 design 값과 일치                                                 |
| `chat-socket-reconnect.test.mjs` | 중복 reconnect 방지, event 중복 허용, gap recovery, dispose 뒤 stale result 차단                      |
| `design-size-tokens.test.mjs`    | conversation과 composer 크기가 semantic token의 단일 원천을 사용                                      |
| `layout-focus.test.mjs`          | route 진입 시 예측 가능한 main heading focus와 back navigation                                        |

기존 `frontend/src/lib/api/`의 직접적인 browser transport 코드는 복사하지 않는다. 새 앱의
screen과 component는 HTTP client를 import하지 않고 repository와 sync boundary만 사용한다.

## 7. inventory와 backlog 경계

### 7.1 route 파일 15개

기존 route inventory는 layout 2개, root page, login, onboarding, groups 목록과 상세,
group chat, invite 생성·참여, group settings, topic 상세와 topic chat, notifications,
settings로 총 15개다. 이 중 chat entry topology와 focused conversation behavior만 제품
근거로 읽었다. 여러 room navigation을 포함한 실제 route 구현은 새 로드맵의 M6-M13 계획에서
다룬다.

### 7.2 API 파일 8개

기존 API inventory는 auth, chat, shared client, group, notification, push, topic, upload다.
현재 slice에서 chat 모듈도 transport 계약으로 재사용하지 않고 idempotency와 history
recovery 의도만 참고한다. 각 domain의 실제 API 연결은 기존 PWA 모듈을 복사하지 않고
서버 계약에 따라 M6-M13에서 구현한다.

### 7.3 test 파일 8개

chat spacing, socket reconnect, design size, layout focus의 회귀 의도만 현재 slice에
번역했다. list row, push recovery, push intent, topic rename의 회귀 의도는 해당 기능을
구현하는 후속 마일스톤에서 검토한다.

### 7.4 계획 범위와 contract-gap backlog

- 계획 범위: server contract가 정의한 group·초대·chatroom/message·realtime/delta·topic/tag·
  media·notification history·Expo push installation은 roadmap의 M7-M13 범위다. M7-M9는 종료했으며
  focused·aggregate 자동 결과와 native/live 사용자 수용 범위는 구분해 기록한다.
- contract-gap backlog: Apple login, STT/on-device AI, presence/typing/reaction,
  message edit/delete와 새 push backend, 현재 server contract에 없는 provider·기능
- Server contract intake와 계정 기반은 M6에서 정식 종료했다. M7은 M6 authorized executor와
  origin/user/epoch fence를 재사용해 group 상태를 in-memory로 연결한다. membership loss는
  authorized REST 결과·self-leave/delete 성공·foreground/manual refetch까지만 다루며 realtime eviction은 M9다.
- M8의 읽음은 내 읽음 위치 저장이다. 메시지별 상대방 읽음 표시와 주제별 안읽음 표시는
  사용자 결정에 따라 이번 계획에 추가하지 않는다. 기존 마일스톤을 유지하고 별도 요청 때 검토한다.
- 기존 browser 전용 설정: native 동작으로 대체할 필요가 생길 때 별도 검토
- Production signing과 store 제출: 공통 release acceptance의 별도 사용자 결정

계획에 적혔다는 이유만으로 미래 기능의 credential, permission, provider, attachment field를
미리 추가하지 않는다. 필요한 경계는 해당 마일스톤을 승인받고 구현할 때 추가한다.

## 8. no-copy 및 범위 일치 확인

이 문서는 기존 코드를 문장 단위로 옮긴 결과물이 아니다. 확인 기준은 다음과 같다.

- Svelte template, component markup, event handler, JavaScript 함수 본문을 포함하지 않는다.
- Tailwind 또는 daisyUI utility와 component class를 포함하지 않는다.
- CSS selector나 property declaration을 포함하지 않는다.
- legacy browser cookie, endpoint, socket frame을 현재 모바일 계약으로 선언하지 않는다.
- media, voice, STT, notification, OAuth, group/topic 관리의 상세 동작이나 copy를 현재
  slice 요구사항으로 가져오지 않는다.
- semantic color, spacing, typography는 역할과 검증 가능한 값만 기록한다.
- 현재 slice의 source of truth, send 정책, sync 규칙은 [로드맵](roadmap.md)과 일치한다.

M4 bootstrap contract와 M5 local chat을 닫을 때 이 문서의 제품 불변 조건과 roadmap을 함께
대조했다. 기존 PWA 구현과 다른 wire shape와 native keyboard adapter를 선택한 것은 의도
훼손이 아니라 새 모바일 경계의 정상적인 설계다. M6는 종료했고 M7은 구현·로컬 검사 이후
양 플랫폼 그룹 생성·초대·가입·나가기와 계정 전환의 사용자 확인을 받아 2026-09-10 종료했다.
구체적인 수용 범위와 미확인 항목은 [M7 evidence](evidence/M7.md)에 기록한다.
M8도 서버 C3 배포와 양 플랫폼 REST 채팅 수용 후 같은 날 종료했으며 [M8 evidence](evidence/M8.md)에
별도로 기록한다. M9도 자동 검사·독립 리뷰 이후 사용자 수용 4/4 확인과 종료 승인을 받아
같은 날 종료했다. [M9 evidence](evidence/M9.md)에 출처와 한계를 기록한다. M10도 구현·자동 검사·독립 리뷰와
양 플랫폼 사용자 수용 4/4 및 종료 승인을 마쳐 [M10 evidence](evidence/M10.md)에 기록한다.
기존 M11-M13의 범위와 승인 경계는 변경하지 않는다.
