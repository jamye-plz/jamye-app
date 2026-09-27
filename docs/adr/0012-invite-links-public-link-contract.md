# ADR 0012: 초대 링크와 공개 링크 계약을 앱 라우팅 계약으로 둔다

- 상태: Accepted (2026-09-26 사용자 결정; M14 라운드 1 구현과 운영 smoke 반영)
- 결정일: 2026-09-26
- 적용 마일스톤: M14 라운드 1부터
- 대체하는 결정: [ADR 0007](0007-push-installation-device-scope.md)의 non-oauth 딥링크 홈 redirect
  정책과 [ADR 0004](0004-m3-app-foundation-and-preference-deferral.md)의 "development client scheme은
  공개 링크 계약이 아니다" 정책을 초대 링크에 한해 보완한다.

## 맥락

M14 라운드 1의 그룹 초대 UX는 "초대 코드 발급 UI"가 아니라 "초대 링크 공유"다. 공유 대상자는 앱이
설치돼 있으면 iOS Universal Link 또는 Android App Link로 Jamye 앱을 열고, 앱이 없거나 브라우저에서
열면 최소 정보의 landing page를 본다. 동시에 초대 코드는 인증·가입 전 상태에서 들어오는 민감한 입력값이므로
route params, navigation history, 앱 로그에 남기지 않아야 한다.

서버 공개 링크 계약은 jamye-server의 [ADR 0010](../../../jamye-server/docs/adr/0010-app-links-chatroom-media-topic-media-removal.md)과
배포 기록 [§8 운영 smoke](../../../jamye-server/.agents/results/deploy-20260926-181036.md)에 있다.
운영 배포본은 main `5b987a2`이며 AASA, assetlinks, `/invite/{code}` landing route가 smoke 확인됐다.

## 결정

### D1. 공개 HTTPS 초대 URL은 API origin을 재사용한다

공유 URL은 `https://jamye-api.ridewithmin.com/invite/{code}`다. `{code}`는
`^[A-Za-z0-9_-]{16,64}$` 형식만 허용한다. 형식이 틀리면 서버는 404를 반환하고 앱도 초대 코드로
취급하지 않는다.

서버 landing page는 초대 코드 외 정보를 노출하지 않는다. 그룹 이름, 초대 유효성, membership 상태를 DB에서
조회하지 않으므로 enumeration oracle이 되지 않는다. 응답 정책은 다음을 요구한다.

- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `X-Robots-Tag: noindex`
- 외부 리소스 없는 CSP, inline script는 hash로만 허용

스토어 URL이 아직 비어 있으면 App Store / Play Store 버튼 대신 `출시 준비 중`을 표시한다. `앱 열기`는
`jamye://invite/{code}` custom scheme을 사용하고, 초대 코드 표시와 복사 버튼을 제공한다.

### D2. 앱은 HTTPS App Link와 custom scheme을 같은 가입 확인 흐름으로 보낸다

앱이 받는 공개 입력은 다음 두 형태다.

- `https://jamye-api.ridewithmin.com/invite/{code}`
- `jamye://invite/{code}`

`src/app/+native-intent.tsx`는 유효한 코드를 발견하면 `pendingInviteStore`에 넣고 항상 코드 없는
`/groups/join`으로 redirect한다. 가입 확인 화면은 `pendingInviteStore.consume()`으로 코드를 자기 입력
상태에 옮긴 뒤 저장소를 비운다. 로그아웃 시에도 저장소를 비운다.

초대 코드는 다음에 남기지 않는다.

- route params
- navigation history
- Metro/app log
- SQLite나 SecureStore 같은 디스크 저장소

자동 가입은 없다. 사용자는 `/groups/join` 가입 확인 화면에서 `가입`을 눌러야 한다. 로그아웃 상태에서
링크가 들어오면 로그인 완료 뒤 같은 확인 화면으로 이어진다.

### D3. iOS association은 `/invite/*`만 연다

`app.config.ts`의 development identity는 `dev.local.jamyeapp`, Apple Team ID는 `6ZH8V43A7D`다.
`associatedDomains`는 다음 두 항목이다.

- `applinks:jamye-api.ridewithmin.com`
- `applinks:jamye-api.ridewithmin.com?mode=developer`

서버 AASA는 redirect 없이 `application/json`으로 응답하고 다음 앱 ID와 path를 가진다.

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["6ZH8V43A7D.dev.local.jamyeapp"],
        "components": [{ "/": "/invite/*" }]
      }
    ]
  }
}
```

Apple Developer Program의 Associated Domains capability 활성화는 사용자가 수행한다. 개발 기기에서는
Associated Domains Development를 켜고 `?mode=developer` 항목으로 Apple CDN 캐시를 우회한다.

### D4. Android App Link는 development package와 debug SHA-256으로 검증한다

`app.config.ts`의 Android package는 `dev.local.jamyeapp`이며, intent filter는 `autoVerify: true`,
`scheme: "https"`, `host: "jamye-api.ridewithmin.com"`, `pathPrefix: "/invite"`다.

서버의 Android association JSON route는 현재 development package와 debug keystore SHA-256을 포함한다.
debug SHA-256은 다음 값이다.

```text
FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

이 키는 React Native template의 공개 개발 키다. 같은 package name으로 서명한 다른 development 앱도
App Link 검증을 통과할 수 있으므로 이는 개발 단계 수용 위험이다(E3). `jamye://` scheme도 OS 차원에서
다른 앱이 등록할 수 있다. M18 스토어 배포 때 Play signing key SHA-256을 추가하고 release package/스토어
URL 정책을 다시 확인한다.

### D5. 초대 링크는 기존 딥링크 제한의 좁은 예외다

ADR 0007은 알림 tap 라우팅을 URL 딥링크가 아니라 notification-response listener로 처리하고,
`+native-intent`의 non-oauth 딥링크 홈 redirect 정책을 유지했다. ADR 0004는 development client generated
scheme을 공개 계약으로 보지 않았다.

이 ADR은 초대 링크에 한해 E7의 예외를 둔다. 허용 형식은 D2의 두 초대 링크뿐이다. 형식이 맞지 않거나
코드 정규식 검증에 실패하면 초대 링크로 취급하지 않고 기존 정책을 따른다. 외부 URL은 `/`로 보내고,
앱 내부 경로(`/`로 시작)는 query를 뗀 그대로 둔다. OAuth callback 정책과 push tap 정책은 바뀌지
않는다.

## 결과

- M14 라운드 1 기기 검증에서 Android App Link는 `verified`, HTTPS 초대 링크는 코드가 채워진 가입
  화면으로 열렸다. iOS는 `jamye://invite/<code>`가 같은 가입 sheet로 열렸다.
- 운영 smoke에서 AASA와 assetlinks는 200 `application/json`, redirect 없음, `/invite/{code}` landing은
  `no-store`·`no-referrer`·`nosniff`·`noindex`와 hash 기반 CSP를 확인했다.
- 초대 코드는 `/groups/join` route와 Metro 로그에 남지 않는 것이 evidence에 기록됐다.
- release variant, 스토어 URL, Play signing key 추가는 M18 범위다.

## 검증

- `tests/core/auth/callback.test.ts`: 초대 링크가 `pendingInviteStore`와 `/groups/join`으로 흘러가는지 확인한다.
- `tests/features/groups/model/pending-invite-store.test.ts`: 저장소가 메모리 전용 consume/clear 계약을 지키는지 확인한다.
- `tests/app/thin-routes.test.tsx`: 링크로 열린 C3 입력 화면도 root Stack modal option을 받는지 확인한다.
- 수동 smoke: [M14 evidence](../evidence/M14.md)의 "라운드 1 (세션 20260926-181036)" 절과 서버 배포 기록 §8.
