# 잼얘좀 모바일 — 첫 채팅 수직 절편의 제품 의도

- 작성 목적: M1에서 기존 `jamye-plz`의 제품 의미와 회귀 의도를 읽기 전용으로 추출
- 현재 구현 범위: 인증 없는 deterministic fixture 대화방 하나의 offline-first 텍스트 채팅
- 구현 시점: M5 로컬 채팅 읽기·쓰기까지 구현·검증 완료, M6 transport·동기화는 시작 전
- 기준 저장소: [sibling `jamye-plz`](../../jamye-plz/) repository (수정하지 않음)

## 1. 먼저 고정할 해석 원칙

기존 PWA는 제품 의도를 알려 주는 참고자료이지 새 모바일 앱의 기술 계약이 아니다.
브라우저 인증, 기존 REST 경로, 기존 WebSocket 프레임, Svelte 컴포넌트 구조는 그대로
이식하지 않는다. 모바일용 wire contract와 SQLite schema는 M4에서 별도로 제안하고
사용자 승인을 받은 뒤 고정한다.

이번 수직 절편은 다음 경계를 지킨다.

- 사용자는 로그인하지 않는다. 고정된 익명 fixture 사용자와 대화방만 사용한다.
- 화면의 메시지 원본은 SQLite뿐이다. HTTP cache나 메모리 배열을 경쟁 원본으로 두지 않는다.
- 텍스트 메시지만 읽고 보낸다.
- 전송 버튼을 누르면 optimistic message와 outbox command를 하나의 transaction으로 만든다.
- M5는 오프라인 전송 의도를 기기에 남긴다. 재시작·재연결 뒤 같은 `client_msg_id`로
  canonical event 하나에 수렴시키는 processor는 M6에서 구현한다.
- Realtime event 누락을 delta sync로 복구하는 동작도 M6의 목표이며 현재 실행 경로가 아니다.
- composer에서 Enter는 줄바꿈이고, 명시적인 버튼만 전송한다. 한국어 IME 조합 중에는
  전송 동작이 발생하지 않아야 한다.

장기 제품에는 그룹 메인방과 주제별 방이 모두 있지만, 이번에는 그 구조를 구현하지 않고
fixture 대화방 하나로 채팅의 신뢰성만 검증한다.

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
4. **M6 목표:** 온라인이 되면 outbox가 같은 `client_msg_id`로 fixture REST command를 보낸다.
5. **M6 목표:** REST response, realtime event, delta response는 같은 idempotent apply 경로를 쓴다.
6. **M6 목표:** canonical event가 optimistic row를 sent 상태로 수렴시킨다.

M5는 local failed row 재시도에서 기존 message와 outbox identity를 재사용하는 데까지 구현했다.
응답 유실 뒤 재요청과 server canonical message 수렴은 M6에서 검증할 불변 조건이다.

### 3.3 M6 이후에도 realtime은 진실의 근거가 아니다

기존 `chat-socket-reconnect.test.mjs`는 reconnect, 중복 event, history gap, 늦게 도착한
결과가 현재 화면을 오염시키지 않아야 한다는 회귀 의도를 제공한다. 새 앱은 기존 소켓
구현을 복사하지 않고 다음 모바일 규칙으로 번역한다. 아래 항목은 M6 이후의 목표 계약이며,
M5에는 WebSocket·REST delta·network lifecycle 실행 경로가 없다.

- WebSocket은 이미 확정된 event를 빠르게 받는 통로다.
- REST delta sync가 event 누락과 reconnect race를 복구한다.
- REST와 WebSocket event는 동일한 검증과 apply 경로를 지난다.
- `event_id` 중복과 cursor 역행을 저장 계층에서 막는다.
- foreground 복귀, network regain, reconnect 때 delta sync를 요청한다.
- room 또는 화면이 바뀐 뒤 도착한 오래된 비동기 결과는 현재 상태에 적용하지 않는다.

현재 단계의 transport는 인증과 credential이 전혀 없는 local fixture다. 기존 PWA의
cookie, endpoint, socket frame은 모바일 계약으로 사용하지 않는다.

### 3.4 읽던 위치를 잃지 않는다

[`docs/product/design-context.md`](../../jamye-plz/docs/product/design-context.md),
[`ChatRoom.svelte`](../../jamye-plz/frontend/src/lib/components/ChatRoom.svelte), 기존 reconnect test는 대화 흐름의
안정성을 반복해서 요구한다.

- 처음 진입할 때 SQLite의 fixture 메시지를 읽는다.
- 과거 page를 앞에 추가해도 사용자가 보던 첫 visible message의 위치를 유지한다.
- **M6 목표:** reconnect나 delta sync 때문에 이미 읽고 있던 목록을 비우지 않는다.
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
  이해 가능해야 한다. Connection state가 도입되는 M6에서는 app bar 다음 위치를 별도 검증한다.
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
구분하고, 연결·reconnect copy는 실제 transport 상태가 생기는 M6로 보류했다.

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
근거로 읽었다. 여러 room navigation을 포함한 실제 route 구현은 backlog다.

### 7.2 API 파일 8개

기존 API inventory는 auth, chat, shared client, group, notification, push, topic, upload다.
현재 slice에서 chat 모듈도 transport 계약으로 재사용하지 않고 idempotency와 history
recovery 의도만 참고한다. 나머지 domain API는 모두 backlog다.

### 7.3 test 파일 8개

chat spacing, socket reconnect, design size, layout focus의 회귀 의도만 현재 slice에
번역한다. list row, push recovery, push intent, topic rename test는 backlog다.

### 7.4 명시적 backlog

- 카카오·구글·애플 OAuth, account와 token lifecycle, onboarding
- group 생성·초대·owner/member 관리
- topic timeline, seed에서 enriched로 이어지는 흐름
- group main room, topic room, 여러 대화방 navigation
- 사진·동영상·음성·녹음·재생·STT·on-device AI
- read receipt, presence, typing, reaction, message edit/delete
- 인앱 알림, push adapter와 permission, installation, deep link
- PWA 기능과 기존 browser setting
- production server contract, signing, store 제출

현재 범위의 어떤 interface에도 위 기능의 credential, session, permission, provider,
attachment field를 미리 만들지 않는다.

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
훼손이 아니라 새 모바일 경계의 정상적인 설계다. M6도 같은 no-copy 경계에서 별도 승인 후
시작한다.
