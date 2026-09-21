# ADR 0008: 계정 lifecycle(프로필 수정·계정 삭제) 오케스트레이션 배치 결정

- 상태: Accepted
- 결정일: 2026-09-21
- 적용 마일스톤: M13

## 맥락

M13은 서버의 Profile update(U2 `PATCH /api/v1/me`)와 account deletion(U3 `DELETE /api/v1/me`)
계약을 앱에 연결한다. 계획 단계에서 여섯 가지 설계 선택에 대안이 있었다: (1) 프로필 수정
오케스트레이션을 어디에 둘지, (2) 계정 삭제 오케스트레이션을 어디에 둘지, (3) push installation
비활성화와 계정 삭제 호출의 순서, (4) 두 API 클라이언트가 공유하는 HTTP boilerplate를 어디에 둘지,
(5) 아바타 업로드를 이번 범위에 포함할지, (6) 계정 삭제 성공 후 로컬 파일(이전 principal의 SQLite
파일·미디어 캐시)을 물리적으로 정리할지.

## 결정

### 1. 프로필 수정 오케스트레이션: auth-controller의 lean publish primitive + account-lifecycle의 네트워크 호출 분리

- **채택**: `src/core/auth/auth-controller.ts`에 `applyProfile(profile)` 한 개 메서드만 추가한다.
  네트워크 I/O도 storage 쓰기도 없는 동기 발행 primitive로, `disposed || !tokens || state.status
!== "signed-in"`이거나 발행하려는 profile의 `id`가 현재 `state.profile.id`와 다르면 no-op이다
  (다른 계정으로의 오발행 방지 가드, `persistThenProfile`이 이미 쓰는 `active()` 가드와 동일 계열).
  실제 PATCH 호출과 검증은 controller 밖 `src/features/account/model/account-lifecycle.ts`에서
  `session.authorizedRequest`를 통해 수행하고, 성공 시 `session.applyProfile(result)`을 호출해
  controller가 여전히 `state.profile`의 단일 writer로 남는다.
- **기각한 대안 1**: `auth-controller.ts`에 `refresh()`/`logout()`처럼 PATCH를 직접 수행하는
  `updateProfile(nickname, avatarUrl?)` 전체 메서드를 추가.
- **기각 이유 1**: M6-M12의 모든 세션 불변식을 검증하는 가장 위험도 높은 핵심 파일(489줄, 약 31KB
  테스트 스위트)을 M13 한 기능을 위해 불필요하게 키운다. `authorizedRequest`가 이미 어떤 feature에도
  새 결합 없이 동일한 능력을 제공한다.
- **기각한 대안 2**: PATCH 성공 후 `session.retryProfile()`을 호출해 `GET /api/v1/me`를 다시 조회하고
  그 결과로 controller가 재발행하도록 함.
- **기각 이유 2**: PATCH 응답이 이미 authoritative한 갱신된 `User`를 담고 있으므로, 한 사용자 동작에
  네트워크 호출을 두 번 만든다. `retryProfile`은 오류-재시도 상태(`profile-recovery.ts`의
  eligibility 게이트)를 위해 설계된 경로라, happy-path write에 재사용하면 두 호출 지점의 의도가
  섞인다.

### 2. 계정 삭제 오케스트레이션: 전용 account-lifecycle.ts, auth-controller.ts 아님

- **채택**: 신규 `src/features/account/model/account-lifecycle.ts`(`createAccountLifecycle`)가
  push-disable → `authorizedRequest`(DELETE) → 성공 시에만 `session.logout()` 순서를 소유한다.
  push-lifecycle과 account-api 의존성은 로컬에 선언한 구조적 port 타입(`PushDisablePort`,
  `AccountApiPort`)으로 받아, `src/features/account/data/account-api.ts`나
  `src/features/notifications/model/push-lifecycle-provider.tsx`를 직접 import하지 않는다(M12
  A1/A2의 독립 tier-1 작업 패턴을 그대로 따름). UI 계층(A3)이 구체 인스턴스를 조립해 주입한다.
- **기각한 대안**: `auth-controller.ts`에 `logout()`을 본뜬 `deleteAccount()` 메서드를 추가해 U3
  호출을 controller가 직접 수행.
- **기각 이유**: 프로필 수정과 동일한 회귀 위험 논리에 더해, core auth 모듈이 account-scoped API
  client를 import해야 하므로 이 코드베이스의 기존 의존 방향(feature가 core/auth에 의존, 역방향은
  없음)을 뒤집는다.

### 3. Push installation 비활성화 → 계정 삭제 순서: 기존 로그아웃 순서를 그대로 거울

- **채택**: `deleteAccount()`는 `pushDisable.disable()`(best-effort, 실패는 삼킴)을 먼저 호출한 뒤
  `authorizedRequest(deleteAccount)`를 호출한다. 기존 로그아웃 버튼(`account-screen.tsx`)의
  `pushLifecycle.disable()` → `session.logout()` 순서를 그대로 거울로 삼아, 그 사이에 U3 DELETE
  호출을 끼워 넣은 형태다.
- **기각한 대안**: DELETE를 먼저 호출한 뒤 push installation을 비활성화.
- **기각 이유**: U3 성공은 서버 측 refresh token을 즉시 무효화한다. DELETE를 먼저 호출하면 이어지는
  push-disable 호출이 이미 무효화된 토큰으로 `authorizedRequest`를 거쳐야 해 401 경로를 타거나 아예
  best-effort로도 신뢰할 수 없게 된다. push-disable을 토큰이 아직 확실히 유효한 시점에 먼저 실행해야
  installation cleanup이 실패 없이 시도된다.

### 4. 공용 HTTP boilerplate 승격: src/core/http/http-requester.ts, 세 번째 request() 구현 금지

- **채택**: `createHttpRequester`/`HttpRequestFn`/`parseRetryAfterSeconds`를
  `src/features/notifications/data/notifications-http.ts`에서 신규 core 모듈
  `src/core/http/http-requester.ts`로 동일 동작 그대로 이동했다. `notifications-http.ts`는 이제
  이를 재-export하는 thin shim이고(`notifications-api.ts`/`push-installations-api.ts`와 그 테스트는
  무수정), `account-api.ts`는 이동된 `createHttpRequester`를 자체 `AccountApiError`와 함께 재사용해
  구축했다.
- **기각한 대안 1**: `account-api.ts`가 `auth-api.ts`의 로컬 `request()` 클로저를 그대로 본떠 독립
  구현.
- **기각한 대안 2**: `account-api.ts`가 `src/features/notifications/data/notifications-http.ts`를
  feature 경계를 넘어 직접 cross-import.
- **기각 이유**: PLAN 리뷰 r1의 Simplicity 판정이 "account-api가 공유 가능한 HTTP requester를
  재구현한다"를 FAIL로 지적했다. 대안 1은 세 번째 `request()`/fetch/timeout/abort/에러봉투
  구현을 코드베이스에 만들어 세 곳에서 같은 동작을 따로 유지해야 한다. 대안 2는 notifications
  기능 전용 모듈에 대한 cross-feature-boundary import로, 이 코드베이스가 다른 곳에서 일관되게 피하는
  패턴이다(M12 A1/A2가 구조적 타입 재선언으로 동일 이유를 든 전례와 같다). core로 승격하는 것이
  두 문제를 모두 피한다.

### 5. 아바타 업로드: 이번 범위에서 보류

- **채택**: `avatar_url`은 `UserPatch` 계약과 `account-api.ts`에 이미 배선돼 있어 향후 사용
  가능하지만, 업로드 UX(이미지 선택·전송)는 M13에 포함하지 않는다.
- **기각한 대안**: M11의 미디어 object-transfer 파이프라인
  (`src/features/media/platform/media-object-transfer.ts`)을 재사용해 아바타 이미지를 선택·업로드
  하는 흐름을 이번 마일스톤에 함께 구현.
- **기각 이유**: 로드맵 M13의 핵심 작업/완료 증거는 닉네임 수정과 계정 삭제만 지정한다. 이미지 선택
  UX·업로드·`avatar_url` 왕복을 추가하는 것은 요구사항 브리프가 명시적으로 이번 범위 확대 후보로만
  표시한 항목이며, 이번 마일스톤의 완료 증거가 다루지 않는 상호작용 표면을 끌어들인다.

### 6. 파괴적 로컬 정리: 전면 보류

- **채택**: U3 성공 뒤에도 삭제 전 principal의 SQLite 데이터베이스 파일과 캐시된 미디어는 디스크에
  그대로, 참조되지 않은 채로 남는다(`resolveAccountDatabaseFilename`이 origin+userId를 해시하므로
  재로그인으로 생기는 새 principal은 다른 파일명을 받아 절대 충돌하지 않는다). 이 plan의 어떤
  task도 해당 파일을 삭제하지 않는다.
- **기각한 대안**: `account-lifecycle.ts`(또는 `account-scope.ts`)가 삭제 성공 경로의 일부로 SQLite
  파일과 방금 삭제된 principal의 expo-file-system 미디어 캐시를 물리적으로 정리.
- **기각 이유**: 로컬 데이터베이스/미디어 파일을 물리적으로 삭제하는 것은 원리적으로 되돌릴 수 있는
  서버 측 삭제와는 구분되는, 되돌릴 수 없는 로컬 파괴적 작업이다. 요구사항 브리프가 이를 계정 삭제
  승인과 독립적으로 별도의 명시적 사용자 승인이 필요하다고 명시했고, 로드맵의 완료 증거 어떤 항목도
  M13에 이를 요구하지 않는다.

## 결과

- `bun run check:code`(typecheck·lint·format·check:architecture·coverage) PASS: 151 suites /
  1,658 tests, coverage statements/branches/functions/lines 87.63% / 82.63% / 88.66% / 90.43%
  (threshold 80%).
- 실제 계정 삭제 E2E와 파괴적 로컬 정리는 이번 결정과 무관하게 별도 명시 승인 이후로 미룬다.
  디바이스 실행 검증과 사용자 수용도 대기 상태다. 상세는 [M13 evidence](../evidence/M13.md)에
  기록한다.
