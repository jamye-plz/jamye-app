# Expo 푸시 개발 연결

이 문서는 M12 알림함·Expo 푸시 구현에 필요한 사용자 준비물(EAS 프로젝트, Android FCM, iOS APNs)과
로컬 검증 방법을 기록한다. 앱 식별자: iOS bundleIdentifier `dev.local.jamyeapp`, Android package
`dev.local.jamyeapp`, slug `jamye-app`(`app.config.ts`, [ADR 0004](adr/0004-m3-app-foundation-and-preference-deferral.md)
참고). 모든 명령은 `jamye-app` 루트에서 devShell 안에서 실행한다:
`nix develop . --command bash --noprofile --norc -c '<cmd>'`. `app.config.ts`가 `APP_VARIANT`를
요구하므로 EAS 명령 앞에 `APP_VARIANT=development`를 붙인다.

## 0. Expo 계정과 EAS CLI

1. https://expo.dev 에서 계정을 생성하거나 로그인한다.
2. EAS CLI는 전역 설치 없이 `bunx eas-cli@latest …`로 실행한다(전역 설치를 원하면 `bun add -g eas-cli`).
3. 로그인: `APP_VARIANT=development bunx eas-cli@latest account:login`(브라우저 로그인). 확인:
   `bunx eas-cli@latest whoami`.

## 1. Expo 프로젝트와 projectId

현재 저장소는 EAS 프로젝트 `@jamye-plz/jamye-app`(owner `jamye-plz`, projectId
`6a27e581-0093-4e75-bd88-01be99fcdab5`)에 연결돼 있으며 `app.config.ts`의 `extra.eas.projectId`에
반영돼 있다. 새로 연결해야 하는 경우:

1. `APP_VARIANT=development bunx eas-cli@latest init` → 계정 아래 새 EAS 프로젝트를 만들거나 기존
   프로젝트를 연결한다(`eas init --id <projectId>`).
2. `app.config.ts`는 동적 설정이라 CLI가 `extra.eas.projectId`를 자동으로 쓰지 못할 수 있다.
   출력된 projectId(UUID)를 `app.config.ts`의 `extra.eas.projectId`에 직접 반영한다. 확인:
   `bunx eas-cli@latest project:info`.
3. 대안: https://expo.dev 대시보드 → Projects → Create a project → 생성 후 Project ID 복사.

> 참고: slug를 `jamye-development`에서 `jamye-app`으로 바꾸는 과정에서 사고로 생성된 EAS 프로젝트
> `@jamye-plz/jamye-development`가 남아 있다. 삭제 여부는 사용자 결정 대기다
> ([M12 evidence](evidence/M12.md) 참고).

## 2. Android — Firebase FCM V1

현재 저장소는 Firebase 프로젝트 `jamye-app-981024`(패키지 `dev.local.jamyeapp`)의
`google-services.json`을 저장소 루트에 두고 있으며 FCM V1 서비스 계정 키는 EAS에 업로드 완료
상태다. 처음부터 설정하는 경우:

1. https://console.firebase.google.com → 프로젝트 만들기.
2. 프로젝트 → Android 앱 추가 → 패키지 이름 `dev.local.jamyeapp` → `google-services.json` 다운로드.
3. 파일을 `jamye-app/google-services.json`(저장소 루트)에 둔다. 공개 식별자만 담고 있어 커밋해도
   된다. `app.config.ts`의 `android.googleServicesFile`이 이 경로를 가리키며 architecture checker
   allowlist에도 등록돼 있다.
4. 서비스 계정 키(비밀): Firebase 콘솔 → 프로젝트 설정(톱니) → 서비스 계정 탭 → "새 비공개 키
   생성" → JSON 다운로드. **저장소 밖**(예: `~/Secrets/jamye-fcm-service-account.json`)에 보관하고
   절대 커밋하지 않는다.
5. Expo에 업로드: `APP_VARIANT=development bunx eas-cli@latest credentials -p android` →
   `Google Service Account` → `Manage your Google Service Account Key for Push Notifications (FCM V1)`
   → `Set up a Google Service Account Key for Push Notifications (FCM V1)` → `Upload a new service
account key` → 4의 JSON 경로 입력. 대안: expo.dev → 프로젝트 → Credentials → Android →
   Service Credentials → "FCM V1 service account key" 업로드.
6. 기기: 실기기는 USB 디버깅을 켜고 연결(`adb devices`에 표시). 에뮬레이터는 Google Play 시스템
   이미지여야 FCM 토큰을 받는다.

> **`eas credentials`가 생성하는 `eas.json`은 커밋하지 않는다.** `eas.json`이 없으면 위 명령이
> 생성 프롬프트를 띄우는데, 이 파일은 임시 작업 산물이다. 커밋 전 `git status`로 확인한다.

## 3. iOS — Apple Developer와 APNs

현재 저장소는 Apple Developer Program이 활성 상태이고 APNs push key가 EAS credentials에 등록돼
있다. 처음부터 설정하는 경우:

1. Apple Developer Program(유료) 가입. Xcode → Settings → Accounts에 Apple ID 추가, Team 확인
   (Team ID 기록).
2. App ID `dev.local.jamyeapp`: 로컬 빌드(`expo run:ios --device`)에서 Xcode 자동 서명이 App ID를
   등록하고 Push Notifications capability를 붙인다(`expo-notifications` 플러그인이
   `aps-environment` entitlement를 추가한다). 자동 서명이 실패하면
   https://developer.apple.com/account → Certificates, Identifiers & Profiles → Identifiers → + →
   App IDs → Bundle ID `dev.local.jamyeapp` → Capabilities에서 Push Notifications를 체크한다.
3. APNs 키(.p8): 같은 화면 → Keys → + → 이름 입력, "Apple Push Notifications service (APNs)" 체크
   → Register → `.p8` 다운로드(한 번만 가능), Key ID와 Team ID 기록. `.p8`은 저장소 밖에 보관한다
   (`.gitignore`가 `*.p8`을 이미 제외한다).
4. Expo에 등록: `APP_VARIANT=development bunx eas-cli@latest credentials -p ios` →
   `Push Notifications: Manage your Apple Push Notifications Key` → 기존 `.p8` 업로드(경로·Key
   ID·Team ID) 또는 Apple ID 로그인으로 EAS가 새 키를 생성·등록한다. 대안: expo.dev → 프로젝트 →
   Credentials → iOS → Push Key 업로드.
5. 기기: iOS 16+ 실기기는 설정 → 개인정보 보호 및 보안 → 개발자 모드 켜기, Mac 신뢰. 이름 확인:
   `xcrun xctrace list devices`. Apple Silicon Mac의 iOS 16+ 시뮬레이터(macOS 13+/Xcode 14+)는
   원격 알림 등록이 가능해 Expo 토큰 발급·수신 테스트에 쓸 수 있다. 먼저 시뮬레이터로 시도하고
   안 되면 실기기를 쓴다.

## 4. 로컬 테스트 — mocked `expo-notifications`/`expo-device`

모든 자동 테스트는 native 모듈을 mock으로 대체해 실행한다. native 자격 증명이나 실기기 없이도
로직을 검증할 수 있다.

- `tests/__mocks__/expo-notifications.ts`: 권한/토큰/리스너 API를 `jest.fn()`과 리스너 Set으로
  구현. `__emitPushToken`/`__emitNotificationResponse`/`__emitNotificationReceived`/
  `__resetExpoNotificationsMock` 등 테스트 헬퍼를 제공한다.
- `tests/__mocks__/expo-device.ts`: `isDevice` live-binding과 `__setIsDevice`/
  `__resetExpoDeviceMock`를 제공해 시뮬레이터/실기기 분기를 테스트한다.
- 관련 테스트: `tests/features/notifications/**`(플랫폼 어댑터, lifecycle state machine, 알림함
  UI, push tap handoff), `tests/core/contracts/server/notifications.test.ts`,
  `tests/core/contracts/server/push-installations.test.ts`, `tests/app/notifications-route.test.tsx`.
- 실행(devShell 안에서): `bunx jest tests/features/notifications tests/core/contracts/server
tests/app/notifications-route.test.tsx`.

이 mocked 테스트는 permission_denied/missing_project_id/not_physical_device degrade, token
rotation, stale installation 재등록, 계정 전환 시 device-scoped `installation_id` 재사용 순서를
검증한다. **native 재빌드나 실제 push 수신을 대체하지 않는다.**

## 5. 재빌드 (승인 시에만 실행)

`expo-notifications`/`expo-device`는 native 모듈이라 clean prebuild + 플랫폼 재빌드가 필요하다:
설치 → `app.config.ts`의 `expo-notifications` 플러그인·`googleServicesFile`·`extra.eas.projectId`
반영 확인 → clean prebuild → `bun run expo:run:android --device <기기|AVD>` /
`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bun run expo:run:ios --device <기기>`. 이 재빌드는 **별도
사용자 승인 없이 실행하지 않는다**([로드맵](roadmap.md#m12-알림함과-expo-푸시),
[M12 evidence](evidence/M12.md) 참고).

## 6. 서버(homelab) — 선택

서버 코드는 `JAMYE_EXPO_ACCESS_TOKEN`을 선택 값으로 읽는다(없어도 Expo push API로 발송 가능;
expo.dev 프로젝트에서 "Enhanced push security"를 켜면 필수). 등록하려면: expo.dev → Account
settings → Access tokens → Create token → homelab `secrets/jamye-server.yaml`(sops)에
`jamye-server/expo_access_token` 추가 → `services/jamye-server.nix` 환경 블록에
`JAMYE_EXPO_ACCESS_TOKEN=${config.sops.placeholder."jamye-server/expo_access_token"}` 추가 → 배포.
현재 homelab 환경 블록에는 이 값이 없다.

## 7. 실기기 수신 검증 (재빌드 이후)

계정 화면의 알림 섹션(`NotificationSettingsSection`)에 마스킹된 Expo 토큰과 등록 상태가 표시된다.
https://expo.dev/notifications 의 테스트 도구에 `ExponentPushToken[...]`을 넣어 수동 발송하면
서버와 무관하게 기기 수신을 확인할 수 있다. 서버 경유 검증은 다른 계정이 새 주제·메시지를 만들 때
수신되는지로 확인한다. 이 검증은 자동화된 로컬 테스트를 대체하지 않으며, 결과는
[M12 evidence](evidence/M12.md)의 "실기기 푸시 증거" 절에 자동 검사 증거와 분리해 기록한다.
