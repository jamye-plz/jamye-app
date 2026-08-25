# ADR 0001: Expo SDK 57 default template을 명시적으로 사용한다

- 상태: Accepted
- 결정일: 2026-08-24
- 적용 마일스톤: M2

## 맥락

이 저장소는 Expo application scaffold보다 먼저 Nix devShell, OMA 설정, 제품 문서와 Git
기준선을 보유한 non-empty repository였다. Repository root에서 `create-expo-app`을 바로
실행하면 기존 파일과 생성물의 충돌, 부분 실패, 암묵적 template version을 승인 전에
구분하기 어렵다.

M1 조사에서 Expo SDK 57을 stable 기준선으로 승인했지만, default template의 patch
dependency와 route 구조는 실행 시점에 달라질 수 있다. 따라서 계획이 patch version이나
생성 경로를 추정해서는 안 됐다.

## 결정

사용자가 repository 밖의 임시 디렉터리에서 다음 원칙으로 scaffold를 생성한다.

```sh
bun create expo <temporary-path>/template \
  --template default@sdk-57 \
  --no-install \
  --no-agents-md
```

에이전트는 생성 결과를 읽기 전용으로 조사하고, 실제 version·route·충돌 manifest를
사용자에게 제시한다. 사용자가 matching attempt를 승인한 뒤에만 exact allowlist를 기존
repository에 무덮어쓰기 방식으로 통합한다. 생성된 nested `.git`과 template README는
통합하지 않는다.

2026-08-24의 승인된 attempt-01 결과는 다음과 같다.

| 항목 | 실제 생성 값 |
|---|---|
| template selector | `default@sdk-57` |
| Expo | `~57.0.16` |
| React Native | `0.86.2` |
| React | `19.2.3` |
| Expo Router | `~57.0.16` |
| TypeScript | `~6.0.3` |
| entry | `expo-router/entry` |
| route root | `src/app/` |

Route는 `src/app/_layout.tsx`, `src/app/index.tsx`, `src/app/explore.tsx`이며 M2에서 이동하거나
재구성하지 않는다. TypeScript alias `@/*`는 `./src/*`를 가리킨다. Native tab 기준선은
`expo-router/unstable-native-tabs`, web tab 기준선은 `expo-router/ui`다.

`app.json`의 Expo Router plugin, `typedRoutes: true`, `reactCompiler: true`와 splash 설정도
생성된 값 그대로 유지한다. 앱 이름·slug·scheme의 `template` placeholder, 아직 존재하지
않는 iOS bundle identifier·Android package name·EAS project ID는 M2에서 임의로 확정하지
않는다.

## 선택하지 않은 대안

### Repository root에서 직접 scaffold

기존 AGENTS/OMA/Nix/docs/Git 자산과 충돌하거나 부분 생성될 위험을 승인 전 쓰기로
만든다. 복구가 기존 파일의 덮어쓰기 여부에 의존하므로 선택하지 않았다.

### Template 결과를 수동으로 예측해 작성

실행 시점의 patch dependency, route와 asset 구성이 공식 template과 달라질 수 있다.
실제 생성 결과 대신 계획이 version을 발명하게 되므로 선택하지 않았다.

### 암묵적 default template 사용

SDK 전환 기간에는 암묵적 default가 목표 SDK와 다를 수 있다. `default@sdk-57`을
명시해 SDK line을 고정했다.

### M2에서 route 이동 또는 Development Build 구성을 함께 수행

M2의 목적은 실제 template 기준선을 안전하게 안착시키는 것이다. Route 책임 분리,
`expo-dev-client`, app variant, CNG/native 구성은 M3 이후 별도 계획과 사용자 승인을
거친다.

## 결과

- SDK line과 실제 patch dependency를 구분해 기록할 수 있다.
- 기존 repository 자산을 template보다 우선해 보존한다.
- M2 diff는 승인된 생성 파일, `packageManager` 추가와 append-only `.gitignore` 병합으로
  제한된다.
- Default template의 demo UI와 placeholder는 제품 UI가 아니며 이후 마일스톤에서 점진적으로
  교체한다.
- M2만으로 Development Build, native build 또는 runtime 성공을 보장하지 않는다.

## 근거

- [`docs/research/mobile-baseline.md`](../research/mobile-baseline.md)
- [`docs/roadmap.md`](../roadmap.md)
- `package.json`, `app.json`, `tsconfig.json`, `src/app/`
- M2 attempt-01 inspection·approval·integration artifact (`.agents/results/`, local runtime evidence)
