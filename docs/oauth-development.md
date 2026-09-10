# OAuth 개발 연결

이 문서는 M5 이후 OAuth vertical과 M6 shared-session/account-safe shell의 구현 기록이다.
로그인 뒤 authenticated home/profile/logout, M7 group navigation과 M8 REST chat이 현재 source에 연결됐다.
M8의 별도 구현·배포·사용자 수용은 [M8 evidence](evidence/M8.md)에 기록한다. M6의 자동 통합 검사와 요구사항/회귀 리뷰는
통과했으며, 의존성 보안 수정 뒤 양 플랫폼 재빌드·설치와 Kakao·Google 실계정 로그인
4개 조합도 확인했다. 추가 세션 검증에서 양 플랫폼 복원·로그아웃 유지와 Android 취소·재로그인을
확인했다. 사용자의 iOS 취소·Kakao·Google 재로그인 확인과 종료 승인으로 2026-09-09 M6를
정식 종료했다. 보안 패치와 남는 원본 감사
경고는 [개발 검증 기록](development-workflow.md)에 구분해 기록한다. 후속 범위와 승인 순서는
[로드맵](roadmap.md)의 M9 이후를 따른다.

`EXPO_PUBLIC_APP_MODE=local-fixture`를 명시적으로 설정하면 기존 SQLite fixture 채팅만 표시하며 네트워크나 인증을 시작하지 않습니다. 연결 인증을 시험할 때만 `.env.local`에 `EXPO_PUBLIC_APP_MODE=connected-auth`와 `EXPO_PUBLIC_API_ORIGIN=https://jamye-api.ridewithmin.com`을 둡니다.

앱은 시스템 인증 브라우저와 PKCE를 사용합니다. Kakao 및 Google authorize/exchange 요청에는 각각의 고정 HTTPS provider callback (`https://jamye-api.ridewithmin.com/api/v1/auth/oauth/{provider}/callback`)을 보내고, 브라우저 반환 URI는 `jamye://oauth/kakao` 또는 `jamye://oauth/google`입니다. Authorization code와 state는 OAuth 프로토콜상 callback URL에 일시적으로 전달됩니다. 앱은 이를 검증에 사용하되 로그·SQLite·환경 파일에 저장하거나 화면에 표시하지 않습니다. Access/refresh token은 HTTPS 응답 본문으로만 받고, API origin과 함께 SecureStore에 저장하며 URL에는 넣지 않습니다.

API 요청은 `EXPO_PUBLIC_API_ORIGIN`으로 보냅니다. `https://jamye-media.ridewithmin.com`은 서버가 발급하는 미디어 서명 URL의 공개 origin입니다. 향후 미디어 연동에서는 API가 반환한 전체 URL과 서명 query를 그대로 사용해야 하며, 앱에서 host/path/query를 조합하거나 API bearer token을 미디어 요청에 붙이지 않습니다. M6에서 수용한 `connected-auth` 범위는 shared session을 통한 로그인·U1 프로필·세션 복원·갱신·로그아웃, origin+UUID account namespace와 health 진단입니다. M7 그룹·멤버십·초대 연동은 로컬 검사 이후 2026-09-10 양 플랫폼 그룹 작업·계정 전환의 사용자 확인을 받아 종료했습니다. M8도 실제 주제 목록·메시지 조회·전송·내 읽음 위치 저장과 양 플랫폼 사용자 확인을 마쳤습니다. 파일 업로드·다운로드, WebSocket/delta, 자동 outbox dispatch, media/push와 offline authenticated restore는 연결하지 않았습니다. 사용하지 않는 별도 media base URL 환경변수는 추가하지 않습니다.

기존 개발 빌드는 `scheme: jamye`와 SecureStore/WebBrowser native plugin을 포함합니다. 이 native 설정을 변경할 때에는 clean prebuild 및 iOS/Android Development Build 재설치가 필요합니다. M6 기능 구현에서는 native 설정이나 의존성을 변경하지 않았습니다. 이후 2026-09-09 승인된 보안 수정에서 하위 의존성과 패치를 변경하고, clean prebuild와 양 플랫폼 재빌드·설치를 완료했습니다. 콜드/unsolicited callback은 Router 전에 query를 제거한 고정 landing route로만 전달되며, 새 로그인을 시작하라는 화면만 보입니다.

실제 provider console에는 app scheme가 아닌 위의 두 HTTPS callback을 정확히 등록합니다. provider 로그인과 배포된 callback smoke는 별도의 실계정/배포 검증이며 로컬 자동 테스트의 성공으로 대체되지 않습니다.

## 오류와 세션 확인

로그인 전에 실패하면 provider 버튼으로 새 로그인을 시작합니다. 토큰 저장을 마친 뒤 프로필 요청만 실패했을 때는 `프로필 다시 시도`를 표시합니다. 보안 저장소를 읽거나 지우지 못한 경우에는 각각 세션 복원 또는 로그아웃을 다시 시도합니다. 이전 authorization code를 재사용하지 않습니다.

Refresh 응답이 유실되거나 오류가 나면 서버에서 refresh token을 이미 교체했을 수 있으므로
이전 토큰으로 자동 재시도하지 않고 다시 로그인합니다. 교체된 토큰 저장 뒤 profile만 실패한
경우에는 저장된 새 토큰으로 profile을 다시 조회합니다.

초기 OAuth 구현 수용 당시 사용자가 iOS 시뮬레이터의 Kakao, Android 에뮬레이터의 Google 실계정 로그인 후 앱 복귀와 프로필 표시 성공을 확인했습니다. 배포된 두 HTTPS callback의 정상·취소·잘못된 query 응답도 별도로 확인했습니다. 이 역사적 결과만으로 재시작·실제 토큰 만료 후 갱신·로그아웃이나 나머지 provider/platform 조합까지 검증한 것으로 기록하지 않았습니다. 현재 M6 빌드의 추가 수용은 아래 표에 별도로 기록합니다.

같은 날 Expo 57.0.21, Expo Router 57.0.20으로 업데이트하고 기존 Router 패치를 유지한 뒤 clean prebuild와 iOS·Android 재빌드·설치를 완료했습니다. 재실행 시 iOS의 Kakao 프로필은 복원됐습니다. Android는 에뮬레이터 연결 복구 직후 로그인 선택 화면이 표시되어 기존 Google 세션 복원은 통과로 기록하지 않았습니다. 이후 사용자가 Kakao·Google 로그인을 다시 실행해 모두 성공했다고 확인했습니다. 앱 삭제·데이터 초기화·로그아웃 명령은 실행하지 않았습니다.

다음은 세션 실행 검증 절차이며, 실제 결과는 아래 M6 세션 검증표에 구분합니다.

1. 앱을 완전히 종료한 뒤 다시 열어 같은 계정의 프로필이 복원되는지 확인합니다.
2. 로그아웃하면 로그인 선택 화면으로 돌아오고, 앱을 다시 열어도 로그인 상태가 복원되지 않는지 확인합니다.
3. 새 로그인을 시작했다가 인증 브라우저를 취소해 안전하게 돌아오는지 확인하고, 다시 로그인합니다.

토큰 만료/refresh, 오류·경합, account isolation과 close/drain 처리는 자동 테스트에도 포함하지만, 배포된 서버에서의 실제 만료 후 갱신 검증과는 구분합니다. 원격 logout 요청은 best-effort이므로 오프라인 로그아웃은 로컬 세션 삭제를 보장하는 범위이며 서버 세션 폐기 성공을 의미하지 않습니다.

## M6 보안 수정 후 사용자 실행 검증

2026-09-09 사용자 승인으로 보안 패치가 적용된 M6 source에서 clean prebuild와 iOS·Android
재빌드·설치·실행을 완료했습니다. 에이전트가 명령을 실행했고 실제 provider 로그인은 사용자가
직접 수행했습니다. 사용자는 현재 빌드에서 Kakao·Google 로그인이 플랫폼 둘 다 성공했다고
확인했습니다. 아래 결과는 이전 버전 기록의 재사용이 아닙니다.

| 플랫폼  | Provider | 현재 M6 실계정 로그인 | 증거 출처                   |
| ------- | -------- | --------------------- | --------------------------- |
| iOS     | Kakao    | PASS                  | 2026-09-09 사용자 직접 확인 |
| iOS     | Google   | PASS                  | 2026-09-09 사용자 직접 확인 |
| Android | Kakao    | PASS                  | 2026-09-09 사용자 직접 확인 |
| Android | Google   | PASS                  | 2026-09-09 사용자 직접 확인 |

실행 환경은 iPhone 17 / iOS 26.5 Simulator와 `jamye_pixel_9_api_36` Android Emulator,
Expo 57.0.21 / Router 57.0.20 / React Native 0.86.3입니다. 앱은 `connected-auth` mode에서
`https://jamye-api.ridewithmin.com`을 호출했습니다. 명령별 native 결과와 중간 실행 오류는
[개발 검증 기록](development-workflow.md)에 남깁니다.

사용자 결과 기록 후 로컬 커밋 전 `bun run check:code`를 다시 실행해 typecheck, lint,
format, architecture 및 43 suites/407 tests가 통과했습니다. 현재 문서 5개/참조 110개도
깨진 참조 없이 검증했습니다. 이 기록 갱신 과정에서는 추가 native build나 로그인을 실행하지 않았습니다.

## M6 세션 검증과 종료 판정 — 2026-09-09

사용자의 `위 세션 확인 -> M6 종료 기록까지 하고 보고해` 요청에 따라 로컬 commit
`909acd3`의 기존 설치본에서 추가 검증했습니다. 아래는 에이전트가 UI와 프로세스 상태로
직접 관찰한 결과와 이후 사용자가 확인한 결과입니다. 출처를 행별로 구분합니다.

| 플랫폼           | 세션 동작                               | 결과와 관찰                                                                       | 증거 출처                   |
| ---------------- | --------------------------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| iOS / Kakao      | 앱 프로세스 종료 후 재실행              | PASS — 같은 프로필, 계정 저장소 준비 및 health 정상 상태 복원                     | 에이전트 관찰               |
| iOS / Kakao      | 로그아웃 후 종료·재실행                 | PASS — 로그인 선택 화면 유지, 이전 프로필 표시 없음                               | 에이전트 관찰               |
| iOS              | 인증 브라우저 취소 후 앱 복귀           | PASS — 정상 복귀 확인                                                             | 2026-09-09 사용자 직접 확인 |
| iOS / Kakao      | 로그아웃 이후 재로그인                  | PASS — 정상 재로그인 확인                                                         | 2026-09-09 사용자 직접 확인 |
| iOS / Google     | 로그아웃 이후 재로그인                  | PASS — 정상 재로그인 확인                                                         | 2026-09-09 사용자 직접 확인 |
| Android / Google | 앱 종료 후 런처 아이콘으로 재실행       | PASS — 같은 프로필, 계정 저장소 준비 및 health 정상 상태 복원                     | 에이전트 관찰               |
| Android / Google | 로그아웃 후 종료·재실행                 | PASS — 로그인 선택 화면 유지, 이전 프로필 표시 없음                               | 에이전트 관찰               |
| Android / Kakao  | 인증 브라우저 닫기                      | PASS — 로그인 선택 화면과 `로그인이 취소되었습니다.` 표시                         | 에이전트 관찰               |
| Android / Google | 취소 후 다른 provider 버튼으로 재로그인 | PASS — 기존 브라우저 인증으로 앱 복귀, Google 프로필·계정 저장소·health 정상 표시 | 에이전트 관찰               |

Android Google 시도는 기존 브라우저 인증으로 자동 완료됐으므로 Google 브라우저 취소
검증으로 세지 않습니다. 각 동작의 관찰을 모든 provider/계정 조합으로 확대하지 않습니다.
이번 실행에는 앱 삭제·데이터 초기화·에뮬레이터 재부팅·재빌드가 없었습니다.
`contracts/bootstrap/`과 fixture database는 보존하며, 정리는 서버 계약 기반 앱 개발 이후로 미룹니다.

Android의 직접 Activity 실행 두 번에서 `BIND APPLICATION ANR`이 기록됐습니다.
이후 런처 아이콘으로 실행한 복원과 로그아웃 후 재실행은 통과했지만, ANR 원인이 해결됐다는
판정은 하지 않습니다. 명령과 관찰 범위는 [개발 검증 기록](development-workflow.md)에 남깁니다.

**M6 종료 판정: completed — 2026-09-09 사용자 최종 확인 및 종료 승인.**
사용자는 iOS 취소 후 앱 복귀와 Kakao·Google 재로그인이 모두 정상이라고 확인하고
`M6 종료해`라고 승인했습니다. 앞선 종료 보류는 이 확인으로 해제했습니다.
구현·자동 검사·native 재빌드·실계정 로그인과 위 세션 수용을 근거로, 서버 계약 수용과
계정 안전 기반이라는 M6 범위를 정식 종료합니다. 사용자 확인을 에이전트 재실행 결과로
바꾸거나 미확인 동작을 PASS로 확대하지 않습니다. 실제 만료를
기다린 refresh, 실계정/origin 변경과 네트워크 장애 검증은 이번 실행에 포함되지 않았습니다.
Refresh·경합·account isolation은 기존 자동 검사 결과와 구분하고, 자동 결과를 실서버 재현으로
표시하지 않습니다. M6 종료와 앱 전체 출시 준비는 별도 판정입니다.

원본 감사의 image-size High 2건과 패치 검증, Android 시작 ANR은 별도 추적 항목으로
보존합니다. M6 종료 기록은 M7의 live/native acceptance를 뜻하지 않습니다. M7 group 요청은
M6 authorized executor를 통해 token을 화면에 노출하지 않고 origin/user/epoch 경계를 재사용하며,
membership loss는 authorized REST/refetch 범위에서만 다룹니다. realtime eviction은 M9 범위입니다.
2026-09-10 사용자가 M7의 양 플랫폼 실서버 그룹 생성·초대·가입·나가기와 계정 전환을 별도로
확인하고 종료 기록을 승인했습니다. 현재 M7 상태와 focused evidence는
[M7 evidence](evidence/M7.md)에 기록합니다. M7 evidence에는 focused snapshot과 최종 automated
aggregate, 에이전트 실행 smoke와 사용자 확인을 분리해 기록합니다. M7은 `COMPLETED / USER_ACCEPTED`이며
기존 M6 로그인 성공을 M7 그룹 기능 검증으로 대체하지 않습니다.
기존 미실행 workflow 단계가 실행된 것으로 기록하지 않으며, 새 immutable evidence 절차도
추가하지 않습니다.

결과에는 플랫폼/provider, 관찰한 단계와 통과·실패만 기록합니다. Authorization code,
state, access/refresh token, 실제 계정 ID는 문서에 기록하지 않습니다.

최종 사용자 확인 전 세션 결과 문서 갱신에서 Prettier, architecture 검사(위반 0건), 로컬 문서 참조 검사
(5개 문서·114개 참조·깨진 참조 0건)와 `git diff --check`가 통과했습니다. 자동 테스트
43 suites/407 tests는 위 로컬 commit 전 실행 결과이며 이번 문서 변경에서 다시 실행한
것은 아닙니다. 이번 요청으로 새 commit이나 push는 하지 않았습니다.

사용자의 최종 iOS 확인을 반영한 M6 종료 문서도 Prettier, architecture 검사(위반 0건),
로컬 문서 참조 검사(5개 문서·116개 참조·깨진 참조 0건), Git whitespace 검사를 통과했습니다.
종료 반영은 문서 변경이며 코드 검사·native build·실계정 로그인을 재실행한 결과가 아닙니다.
