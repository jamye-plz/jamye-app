# jamye-app

잼얘좀의 iOS·Android 앱이다. React Native와 Expo를 사용하지만 기존 SvelteKit PWA를
기계적으로 옮기지 않는다. 첫 수직 절편은 한 대화방의 메시지를 SQLite에서 읽고,
오프라인 전송 의도를 보존한 뒤 재연결 시 canonical event와 동기화하는 데 집중한다.

M2는 2026-08-25에 완료 승인됐으며, 현재 저장소에는 Expo SDK 57 default template의
검토·승인된 기준선만 통합돼 있다. Local commit과 M3 시작은 M2 완료와 별도 절차다.
명령 예시는 실행 절차이며 성공 증거가 아니다. 마일스톤별 실제 검증 결과는
[`docs/evidence/`](docs/evidence/)에 별도로 기록한다.

## 현재 범위

이번 로드맵에 포함되는 기능은 채팅과 offline/realtime 복구다.

- SQLite를 메시지·대화·sync cursor·outbox의 화면 source of truth로 사용
- optimistic message와 outbox command를 하나의 transaction에 기록
- 앱 재시작과 네트워크 복귀 뒤 같은 `client_msg_id`로 한 번만 전송
- REST delta와 WebSocket event를 같은 idempotent apply path로 처리
- 한국어 IME, scroll anchor, safe area, 접근성, dark mode 검증

완성형 카카오·구글·애플 OAuth, 그룹·초대·주제 관리, 미디어·STT, production push,
production identifier·signing·store 제출은 후속 backlog다. 자세한 경계는
[`docs/roadmap.md`](docs/roadmap.md)와
[`docs/product-intent.md`](docs/product-intent.md)를 기준으로 한다.

## 확정된 M2 기준선

| 항목 | 값 |
|---|---|
| Expo | `~57.0.16` |
| React Native | `0.86.2` |
| React | `19.2.3` |
| Expo Router | `~57.0.16` |
| TypeScript | `~6.0.3` |
| package manager | Bun `1.3.13` |
| route root | `src/app/` |
| entry | `expo-router/entry` |

`app.json`의 `typedRoutes`와 `reactCompiler`는 SDK 57 template이 생성한 값을 그대로
유지한다. 앱 이름·slug·scheme은 아직 `template`이고 iOS bundle identifier, Android
package name, EAS project ID는 정하지 않았다. 이 값들은 M3 이후 별도 사용자 결정이다.

결정 근거는 다음 ADR에 있다.

- [`ADR 0001 — Expo SDK 57 default template`](docs/adr/0001-expo-sdk-57-default-template.md)
- [`ADR 0002 — Bun-only package management`](docs/adr/0002-bun-only-package-management.md)
- [`ADR 0003 — M2 bootstrap 품질 증거의 M3 이관`](docs/adr/0003-m2-bootstrap-quality-evidence-deferment.md)

## 개발 환경

CLI 개발 환경의 진입점은 repository root의 Nix flake다.

```sh
nix develop path:.
```

devShell은 Bun, Node.js, JDK, CocoaPods와 Nix-managed Android build SDK를 고정한다.
Xcode·iOS Simulator와 Android Studio·AVD는 사용자가 호스트에 설치한다. Android build
SDK의 원본은 `ANDROID_HOME`과 `ANDROID_SDK_ROOT`가 가리키는 Nix SDK이며, Android
Studio가 관리하는 SDK는 Emulator/AVD에만 사용한다. 정확한 버전과 검증 명령은
[`docs/research/mobile-baseline.md`](docs/research/mobile-baseline.md)에 있다.

Watchman, Maestro, NDK는 현재 devShell에 포함하지 않았다. 필요성이 생기는 마일스톤에서
근거와 설치 주체를 다시 결정한다.

## 명령 소유권과 실행 순서

아래 중요 명령은 사용자가 해당 명령을 명시적으로 위임하지 않는 한 직접 실행한다.
에이전트는 실행 전에 현재 단계의 precondition, 예상 변경, 중단 조건을 명령 카드로
제공하고 결과를 기다린다.

1. devShell 진입

   ```sh
   nix develop path:.
   ```

2. 최초 dependency install

   ```sh
   bun --version
   bun install
   ```

   `bun --version`이 정확히 `1.3.13`이 아니면 install을 실행하지 않는다. 최초 install은
   `bun.lock`을 생성한다. `npm`, `yarn`, `pnpm`으로 install하지 않는다.

3. dependency-aware 검증

   ```sh
   bunx expo-doctor
   bunx tsc --noEmit
   ```

   이 검증은 최초 install과 그 뒤의 정적 manifest 검사가 통과한 다음 별도 사용자
   게이트에서 실행한다. doctor가 실패하면 typecheck를 이어서 실행하지 않는다.

4. template이 제공하는 개발 script

   ```sh
   bun run start
   bun run ios
   bun run android
   bun run web
   bun run lint
   ```

   이 script 목록은 생성된 기준선이다. 사용자는 M2에서 `bun run start`로 Expo Go를 실행해
   iOS Simulator와 ADB에 연결된 Android target에서 default template 화면을 확인했다. 이
   결과는 Metro와 template의 양 플랫폼 실행만 확인하며 Expo Development Build나 native
   binary 검증이 아니다. `expo-dev-client`, CNG/native build 검증은 M3 이후 별도 사용자
   게이트다.

## M2 품질 증거 경계

M2에는 새로 작성한 비-template 실행 가능한 application/domain 로직이 없고 작동하는
test/coverage harness도
없다. 따라서 M2 lint와 coverage를 PASS로 기록하지 않는다. 사용자는 M2 bootstrap에만 한정한
품질 증거 유예를 승인했으며, M3는 실제 lint exit `0`, 의미 있는 test harness와 선언된
coverage denominator, 측정 aggregate coverage 80% 이상을 모두 충족해야 완료할 수 있다.
빈 test suite나 generated template만 검증하는 test로 이 조건을 대신할 수 없다. 정확한 적용
범위와 만료 조건은 [ADR 0003](docs/adr/0003-m2-bootstrap-quality-evidence-deferment.md)에 있다.

## Package manager 규칙

- `package.json#packageManager`는 `bun@1.3.13`이다.
- project lockfile은 `bun.lock` 하나만 허용한다.
- `bun.lockb`, `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`,
  `pnpm-lock.yaml`을 만들거나 commit하지 않는다.
- lockfile이 처음 생성된 뒤의 재현성 검사는 `bun install --frozen-lockfile`을 사용하되,
  별도 사용자 명령 게이트에서 실행한다.
- lifecycle script 실패의 실제 근거와 사용자 승인 없이 `trustedDependencies`를 추가하지
  않는다.

## 초기 구조

```text
src/app/          Expo Router route와 composition
src/components/   SDK 57 default template component 기준선
src/constants/    template theme 상수
src/hooks/        platform별 hook 기준선
assets/           template icon·splash·tutorial asset
docs/             roadmap, 조사, ADR, 실행 증거
nix/              고정 toolchain과 devShell 정의
tools/            읽기 전용 toolchain 진단
```

Route는 이후에도 얇게 유지한다. SQLite query, HTTP, token refresh, WebSocket과 sync 처리는
각 core/feature 경계가 소유하며 route 파일에서 직접 처리하지 않는다.

## Native와 배포 경계

Expo CNG가 생성하는 `ios/`와 `android/`는 초기에는 source-controlled 파일이 아니며
`.gitignore`에 포함돼 있다. native dependency나 app config가 바뀌면 development client를
다시 만들어야 한다.

Nix는 재현 가능한 CLI 환경과 이후의 debug·unsigned build 산출물 패키징까지 담당할 수
있다. production signing, App Store·Play Store 제출, credential과 외부 EAS resource 생성은
사용자가 직접 수행하며 현재 범위에서는 실행하지 않는다. 기존 PWA, `jamye-server`,
homelab도 이 저장소 작업에서 변경하지 않는다.
