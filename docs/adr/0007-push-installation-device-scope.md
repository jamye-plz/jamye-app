# ADR 0007: 알림함 저장·push tap 라우팅·installation_id 스코프 결정

- 상태: Accepted
- 결정일: 2026-09-16
- 적용 마일스톤: M12

## 맥락

M12는 서버의 Notification history(N1/N2)와 Push installation(P2/P3/P4) 계약을 앱에 연결한다.
구현 전 계획 단계에서 세 가지 설계 선택에 대안이 있었다: (1) 알림함을 로컬에 어떻게 유지할지,
(2) push tap 시 목적지로 어떻게 라우팅할지, (3) Expo `installation_id`를 어떤 단위로 스코프할지.

## 결정

### 1. 알림함 로컬 저장: fetch-on-open, 신규 SQLite 테이블 없음

- **채택**: N1 fetch-on-open, in-memory paginated model state, 신규 SQLite 테이블 없음.
- **기각한 대안**: `connected_chat_repository`를 미러링하는 신규 `notifications` SQLite 테이블을 두고
  interval/focus 시 N1으로 동기화하며 local `read_at` 추적과 reconciliation 파이프라인을 구성.
- **기각 이유**: M12 서버 계약은 알림함을 realtime reconciliation이 아니라 N1 fetch로 갱신하도록
  설계됐다. 신규 테이블은 `APPROVED_M4_DATABASE_TABLES` 등록, 마이그레이션, dirty-scope
  reconciliation 로직을 요구하지만 로드맵의 핵심 작업 어디에도 이 요구가 없다. `unread_count`도
  서버가 항상 authoritative 값을 내려주므로 로컬 집계가 불필요하다.

### 2. Push tap 라우팅: notification-response listener, URL 딥링크 아님

- **채택**: `expo-notifications`의 `addNotificationResponseReceivedListener`(warm/background) +
  `getLastNotificationResponseAsync`(cold start), auth-ready 게이팅.
- **기각한 대안**: `jamye://groups/{groupId}/chatrooms/{chatroomId}` 형태의 URL 딥링크를
  expo-router의 Linking/`src/app/+native-intent.tsx`로 라우팅.
- **기각 이유**: `+native-intent.tsx`는 현재 OAuth 보안에 민감한 이유로 모든 non-oauth 딥링크를
  홈으로 redirect한다. 이 redirect 로직을 push URL만 예외 처리하도록 바꾸는 일은 요구사항 범위
  밖이며, 기존 auth 딥링크 처리에 미치는 회귀 위험이 notification-response API를 쓰는 것보다 크다.

### 3. Installation ID 스코프: device-scoped, account-scoped 아님

- **채택**: 앱 설치당 1회 생성하는 랜덤 UUID v4(device-scoped)를 `expo-secure-store`에 고정 키로
  영속화하고, 같은 기기의 로그인/로그아웃 전체에서 재사용한다.
- **기각한 대안**: `src/core/database/account/` 안의 account-scoped SQLite DB에서 계정별로
  `installation_id`를 파생(같은 기기에서 계정을 바꾸면 새 id 생성).
- **기각 이유**: 서버의 `PushInstallation` 모델은 `installation_id`를 device-scoped identity로
  취급한다(register/update/delete lifecycle, `disabled_at` cleanup으로 stale installation 정리).
  account-scoped id는 같은 기기에서 계정을 전환할 때마다 중복 installation row를 만들어 로드맵의
  "device lifecycle"/"stale installation cleanup" 요구를 깨뜨린다.

## 결과

- `bun run check:code`(typecheck·lint·format·check:architecture·coverage) PASS: 145 suites /
  1,571 tests, coverage statements/branches/functions/lines 87.36% / 82.42% / 88.35% / 90.20%.
- 독립 리뷰 3건(Alignment/Safety/Regression) PASS, CRITICAL/HIGH 0건.
- 실기기 push 수신·전달과 계정 전환 시 실제 device 동작 확인은 native 재빌드와 사용자 수용 이후로
  미룬다. 상세는 [M12 evidence](../evidence/M12.md)에 기록한다.
