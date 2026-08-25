# ADR 0003: M2 bootstrap 품질 증거를 M3로 한 번만 이관한다

- 상태: Accepted
- 결정일: 2026-08-25
- 적용 마일스톤: M2에만 적용, M3에서 만료
- 결정 주체: 사용자
- 승인 문자열: `G-M2-SHIP-REMEDIATION governance`

## 맥락

M2의 목적은 승인된 Expo SDK 57 default template을 기존 저장소에 충돌 없이 통합하고 Bun
기준선을 고정하는 것이었다. M2가 새로 작성한 code-like 파일은 Expo ambient type entry 한 줄인
`src/types/expo.d.ts`뿐이며, 이 파일은 실행 로직이 아니다. 인증, 채팅, SQLite, sync, native
module과 제품 domain 로직은 아직 없다.

사용자가 실행한 Expo doctor는 `21/21`, TypeScript `noEmit`은 exit `0`이었다. 독립 VERIFY,
REFINE, SHIP 검토에도 CRITICAL, HIGH, MEDIUM finding이 없었다. 반면 현재 template에는 실제로
작동하는 lint 설정과 test/coverage harness가 없으므로 lint와 coverage는 측정하지 못했다.
M2가 새로 작성한 비-template 실행 application/domain 로직이 없는 generated bootstrap에
의미 없는 test를 붙이거나 측정하지 않은 값을 PASS로 기록하는 것은 품질 증거가 아니다.

## 결정

사용자는 M2에만 적용되는 **bootstrap 품질 증거 유예**를 승인한다.

- M2의 lint와 coverage는 `PASS`가 아니라 `미측정`으로 남긴다.
- 이 유예는 SDK 57 bootstrap 통합 완료 여부를 판단할 때만 사용한다.
- 전역 OMA/Ultrawork 품질 기준은 변경하지 않는다.
- M2의 다음 마일스톤인 M3는 아래 이관 조건을 모두 충족하기 전에는 완료할 수 없다.

M3의 강제 이관 조건은 다음과 같다.

1. 실제로 작동하는 lint 설정과 script를 만들고 사용자 실행 결과가 exit `0`이어야 한다.
2. M3가 작성한 실행 가능한 application 로직을 검증하는 의미 있는 test harness를 만든다.
3. coverage denominator와 제외 대상을 repository에 선언적으로 기록한다.
4. 측정한 aggregate coverage가 80% 이상이어야 한다.
5. generated/hash-pinned template 또는 선언 파일을 coverage에서 제외할 때는 이유를 문서화한다.
6. 빈 test suite, `passWithNoTests`, generated template만 검증하는 test로 조건을 충족할 수 없다.

Dependency 설치나 검증 명령 실행은 기존과 같이 사용자 명령 게이트다. 이 결정은 M2를
release 또는 production-ready로 선언하지 않으며 Development Build, native build, signing,
store 제출, commit 또는 M3 시작을 승인하지 않는다.

## 적용 자격

이 예외가 M2에만 성립하는 근거는 다음과 같다.

- 승인된 scaffold 49개 파일과 13개 디렉터리가 hash-pinned manifest와 일치한다.
- M2가 추가한 `src/types/expo.d.ts`는 compile-time ambient type entry이며 실행 경로가 없다.
- 인증, session, token, 채팅, SQLite, HTTP, realtime, native와 제품 domain 로직이 없다.
- 사용자 실행 Expo doctor와 TypeScript 검사가 통과했다.
- 독립 검토의 CRITICAL, HIGH, MEDIUM finding이 0개다.

이 조건 중 하나라도 사실이 아니었다면 이 유예를 적용할 수 없다.

## 선택하지 않은 대안

### M2에 template 전용 lint와 test를 즉시 추가

M2가 새로 작성한 비-template 실행 application/domain 로직이 없는 상태에서 숫자만 만들기
위한 test는 회귀 위험을 설명하지 못한다. Dependency와 설정 변경을 별도 설계 없이 M2에
끼워 넣게 되므로 선택하지 않았다.

### M3가 끝날 때까지 M2를 영구 HOLD

M3 구조와 품질 기반은 M2의 승인된 scaffold를 전제로 하므로 마일스톤 책임과 승인 경계가
순환한다. M2 사실 증거와 M3 품질 증거를 분리하는 편이 추적 가능하다.

### 전역 품질 기준 완화

후속 마일스톤까지 같은 예외가 반복될 수 있으므로 선택하지 않았다. 이 ADR은 전역 규칙의
변경이 아니라 사용자가 승인한 M2 전용 governance 결정이다.

## 결과와 만료

- M2는 lint/coverage가 미측정이라는 사실을 유지한 채 최종 사용자 완료 판단으로 이동할 수
  있다.
- M3의 lint·test·coverage 조건은 선택 사항이나 backlog가 아니라 완료 조건이다.
- 이 유예는 M3 시작과 동시에 carry-forward obligation이 되고 M3 SHIP 시점에 만료한다.
- 같은 유예를 M3 이후에 자동 연장하거나 다른 마일스톤에서 재사용할 수 없다.
- M3가 조건을 충족하지 못하면 M3는 실패 또는 HOLD이며 M2의 결정을 근거로 통과시킬 수 없다.
- M2 완료, local commit과 M3 시작은 계속 서로 다른 사용자 결정이다.

## 근거

- [`docs/evidence/M2.md`](../evidence/M2.md)
- [`docs/roadmap.md`](../roadmap.md)
- `.agents/results/m2-ship-governance-decision-20260824-183223.json`
- `.agents/results/m2-runtime-smoke-result-20260824-183223.json`
