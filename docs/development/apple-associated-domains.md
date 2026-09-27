# Apple Associated Domains 개발 설정

이 문서는 Jamye development build의 초대 Universal Link를 실제 기기에서 확인하기 위한 설정 절차다. 실제
앱 설정의 원본은 [`app.config.ts`](../../app.config.ts)다.

## 현재 development 값

| 항목                  | 값                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Apple Team ID         | `6ZH8V43A7D`                                                                              |
| iOS bundle identifier | `dev.local.jamyeapp`                                                                      |
| Associated Domains    | `applinks:jamye-api.ridewithmin.com`, `applinks:jamye-api.ridewithmin.com?mode=developer` |
| Android package       | `dev.local.jamyeapp`                                                                      |
| HTTPS link prefix     | `https://jamye-api.ridewithmin.com/invite/`                                               |
| Custom scheme         | `jamye://invite/`                                                                         |

## Apple Developer Program 설정

Associated Domains는 유료 Apple Developer Program 팀에서만 실제 기기용 provisioning profile에 들어간다.
시뮬레이터는 앱 entitlement만으로 동작하므로 portal 설정 없이도 `jamye://` scheme 확인이 가능하다.

1. developer.apple.com/account에 로그인한다.
2. Certificates, IDs & Profiles → Identifiers로 이동한다.
3. `dev.local.jamyeapp`를 연다. 자동 서명으로 만들어진 항목은 "XC dev local jamyeapp"처럼 보일 수 있다.
   없으면 App IDs → App → Explicit Bundle ID로 `dev.local.jamyeapp`를 만든다.
4. Capabilities에서 Associated Domains를 체크한다.
5. Save → Confirm으로 저장한다.

도메인은 Apple portal에 입력하지 않는다. 도메인 목록은 앱 entitlement에 들어가며, 이 저장소에서는
`app.config.ts`의 `ios.associatedDomains`가 원본이다.

자동 서명 팀이 `6ZH8V43A7D`이면 다음 development 기기 빌드 때 Xcode가 Associated Domains capability를
포함한 development provisioning profile을 다시 만든다. 수동 provisioning profile을 쓰는 경우 Profiles에서
profile을 다시 생성해 내려받는다.

## 실제 기기 설정

실제 iPhone/iPad에서 development association을 직접 서버에서 확인하려면 다음 설정을 켠다.

1. 설정 → 개발자로 이동한다.
2. Associated Domains Development를 켠다.
3. development build를 다시 설치한다.

`app.config.ts`의 `applinks:jamye-api.ridewithmin.com?mode=developer` 항목은 Apple CDN 캐시를 거치지
않고 개발 서버 값을 직접 확인하게 한다.

## 확인 명령과 URL

서버의 AASA는 redirect 없이 `application/json`이어야 한다.

```bash
curl -i https://jamye-api.ridewithmin.com/.well-known/apple-app-site-association
```

Apple CDN 반영 상태는 다음 URL로 확인한다. CDN은 캐시가 있으므로 운영 smoke 직후에는 서버 원본과 다를 수
있다.

```text
https://app-site-association.cdn-apple.com/a/v1/jamye-api.ridewithmin.com
```

시뮬레이터에서 scheme 링크를 확인할 때는 `<udid>`를 대상 simulator UDID로 바꾼다.

```bash
xcrun simctl openurl <udid> 'jamye://invite/M14Round1Invite01'
```

초대 HTTPS 링크가 앱으로 열리면 코드 없는 `/groups/join` 가입 확인 화면이 떠야 한다. 초대 코드는 화면 입력에
채워지지만 route params나 navigation history에 남지 않는다.

## Android App Links

Android development App Link에는 별도 콘솔 설정이 필요 없다. 서버의 assetlinks JSON route에 development
package `dev.local.jamyeapp`와 debug signing key SHA-256이 들어 있으면 된다. 스토어 출시(M18) 때 Play
signing key SHA-256을 추가한다.

개발 기기 또는 에뮬레이터에서 재검증한다.

```bash
adb shell pm verify-app-links --re-verify dev.local.jamyeapp
adb shell pm get-app-links dev.local.jamyeapp
```

`pm get-app-links dev.local.jamyeapp`에서 `jamye-api.ridewithmin.com`이 `verified`로 보여야 한다.
