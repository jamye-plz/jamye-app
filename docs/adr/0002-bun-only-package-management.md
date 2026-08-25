# ADR 0002: JavaScript package manager와 lockfile owner를 Bun으로 단일화한다

- 상태: Accepted
- 결정일: 2026-08-24
- 적용 마일스톤: M2 이후

## 맥락

Expo project가 여러 package manager와 lockfile을 동시에 허용하면 local install, CI와
향후 EAS build가 서로 다른 dependency graph를 선택할 수 있다. 이 저장소의 Nix devShell은
Bun 1.3.13과 Node.js 22.23.2를 이미 고정한다. 사용자는 JavaScript dependency 작업에
Bun을 사용하기로 결정했다.

Node.js가 devShell에 존재한다는 사실은 npm을 project package manager로 사용한다는 뜻이
아니다. Expo tooling과 일부 script가 Node runtime 또는 `npm pack` 호환 경로를 필요로
하므로 Node는 실행 환경으로 남는다.

## 결정

- `package.json#packageManager`를 정확히 `bun@1.3.13`으로 고정한다.
- `bun.lock`을 project dependency graph의 유일한 lockfile로 사용한다.
- 최초 `bun install`은 사용자가 승인된 명령 카드에 따라 직접 실행한다.
- 최초 lockfile이 생성된 다음 재현성 검사는 필요할 때
  `bun install --frozen-lockfile`을 별도 사용자 게이트로 실행한다.
- `bun.lockb`, `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`,
  `pnpm-lock.yaml`은 허용하지 않는다.
- lifecycle script가 필요하다는 실제 실패 근거와 사용자 승인 전에는
  `trustedDependencies`를 추가하지 않는다.
- Nix devShell의 Bun version과 `packageManager` version이 다르면 install을 시작하지
  않는다.

## 명령 소유권

최초 install의 순서는 다음과 같다.

```sh
bun --version
bun install
```

첫 출력이 `1.3.13`이 아니거나 다른 package-manager lockfile이 있으면 두 번째 명령을
실행하지 않는다. 실패 시 자동 재실행, lockfile 삭제 또는 package.json 복원을 하지 않고
출력과 Git 상태를 먼저 확인한다.

`bunx expo-doctor`와 `bunx tsc --noEmit`도 dependency graph가 설치되고 정적 manifest
검사가 끝난 뒤 사용자가 별도 검증 게이트에서 실행한다. README의 명령 목록은 실행
가이드이지 성공 증거가 아니다.

## 선택하지 않은 대안

### npm을 기본 package manager로 사용

Node runtime은 필요하지만 dependency owner까지 npm으로 둘 이유는 없다. 사용자가 승인한
Bun/Nix 기준선과 다른 lockfile owner를 만들므로 선택하지 않았다.

### Yarn 또는 pnpm 병행

복수 lockfile과 resolver가 같은 repository 상태를 서로 다르게 해석할 수 있다. 문제
해결용 임시 병행도 lockfile drift를 만들기 때문에 허용하지 않는다.

### Nixpkgs 밖의 최신 Bun을 별도로 패키징

M1의 우선순위는 최신 patch 추종보다 검토 가능한 Nixpkgs derivation과 local toolchain의
일치였다. 따라서 현재 lock이 제공하는 stable Bun 1.3.13을 사용한다. Version 변경은
Nix pin, `packageManager`, lockfile 재생성과 검증을 함께 다루는 별도 결정이다.

## 결과

- Local, CI와 향후 EAS의 package-manager 선택 기준이 하나가 된다.
- `bun.lock` 변경은 dependency graph 변경으로 명확히 검토할 수 있다.
- Expo tooling 때문에 Node.js는 유지하지만 npm lockfile은 생성하지 않는다.
- 향후 EAS를 구성할 때 cloud Bun version도 1.3.13에 맞추거나, version 변경 전체를 별도
  승인해야 한다.
- Bun lifecycle script 정책 때문에 실제 native dependency install에서 추가 설정이 필요할
  수 있으며, 근거가 생겼을 때만 좁게 허용한다.

## 근거

- [`docs/research/mobile-baseline.md`](../research/mobile-baseline.md)
- [`docs/roadmap.md`](../roadmap.md)
- `package.json#packageManager`
