# OAuth 개발 연결

이 문서는 M5 이후 OAuth vertical의 구현·개발 수용 기록이다. 로그인 뒤 group/chat product
navigation, shared session owner, account-scoped SQLite/outbox와 나머지 server API 연결은
완료되지 않았다. 해당 future 범위와 승인 순서는 [로드맵](roadmap.md)의 M6 이후를 따른다.

`EXPO_PUBLIC_APP_MODE=local-fixture`를 명시적으로 설정하면 기존 SQLite fixture 채팅만 표시하며 네트워크나 인증을 시작하지 않습니다. 연결 인증을 시험할 때만 `.env.local`에 `EXPO_PUBLIC_APP_MODE=connected-auth`와 `EXPO_PUBLIC_API_ORIGIN=https://jamye-api.ridewithmin.com`을 둡니다.

앱은 시스템 인증 브라우저와 PKCE를 사용합니다. Kakao 및 Google authorize/exchange 요청에는 각각의 고정 HTTPS provider callback (`https://jamye-api.ridewithmin.com/api/v1/auth/oauth/{provider}/callback`)을 보내고, 브라우저 반환 URI는 `jamye://oauth/kakao` 또는 `jamye://oauth/google`입니다. Authorization code와 state는 OAuth 프로토콜상 callback URL에 일시적으로 전달됩니다. 앱은 이를 검증에 사용하되 로그·SQLite·환경 파일에 저장하거나 화면에 표시하지 않습니다. Access/refresh token은 HTTPS 응답 본문으로만 받고, API origin과 함께 SecureStore에 저장하며 URL에는 넣지 않습니다.

API 요청은 `EXPO_PUBLIC_API_ORIGIN`으로 보냅니다. `https://jamye-media.ridewithmin.com`은 서버가 발급하는 미디어 서명 URL의 공개 origin입니다. 향후 미디어 연동에서는 API가 반환한 전체 URL과 서명 query를 그대로 사용해야 하며, 앱에서 host/path/query를 조합하거나 API bearer token을 미디어 요청에 붙이지 않습니다. 현재 `connected-auth` 범위는 로그인·프로필·세션 복원·갱신·로그아웃이며, 파일 업로드·다운로드와 채팅 서버 동기화는 아직 연결하지 않았습니다. 사용하지 않는 별도 media base URL 환경변수는 추가하지 않습니다.

개발 빌드는 `scheme: jamye`와 SecureStore/WebBrowser native plugin을 포함하므로 이 변경 뒤에는 clean prebuild 및 iOS/Android Development Build 재설치가 필요합니다. 콜드/unsolicited callback은 Router 전에 query를 제거한 고정 landing route로만 전달되며, 새 로그인을 시작하라는 화면만 보입니다.

실제 provider console에는 app scheme가 아닌 위의 두 HTTPS callback을 정확히 등록합니다. provider 로그인과 배포된 callback smoke는 별도의 실계정/배포 검증이며 로컬 자동 테스트의 성공으로 대체되지 않습니다.

## 오류와 세션 확인

로그인 전에 실패하면 provider 버튼으로 새 로그인을 시작합니다. 토큰 저장을 마친 뒤 프로필 요청만 실패했을 때는 `프로필 다시 시도`를 표시합니다. 보안 저장소를 읽거나 지우지 못한 경우에는 각각 세션 복원 또는 로그아웃을 다시 시도합니다. 이전 authorization code를 재사용하지 않습니다.

2026-09-09에 사용자가 iOS 시뮬레이터의 Kakao, Android 에뮬레이터의 Google 실계정 로그인 후 앱 복귀와 프로필 표시 성공을 확인했습니다. 배포된 두 HTTPS callback의 정상·취소·잘못된 query 응답도 별도로 확인했습니다. 이 결과가 재시작·실제 토큰 만료 후 갱신·로그아웃이나 나머지 provider/platform 조합까지 검증한 것은 아닙니다.

같은 날 Expo 57.0.21, Expo Router 57.0.20으로 업데이트하고 기존 Router 패치를 유지한 뒤 clean prebuild와 iOS·Android 재빌드·설치를 완료했습니다. 재실행 시 iOS의 Kakao 프로필은 복원됐습니다. Android는 에뮬레이터 연결 복구 직후 로그인 선택 화면이 표시되어 기존 Google 세션 복원은 통과로 기록하지 않았습니다. 이후 사용자가 Kakao·Google 로그인을 다시 실행해 모두 성공했다고 확인했습니다. 앱 삭제·데이터 초기화·로그아웃 명령은 실행하지 않았습니다.

다음 세션 동작은 사용자가 현재 로그인한 시뮬레이터·에뮬레이터에서 확인합니다.

1. 앱을 완전히 종료한 뒤 다시 열어 같은 계정의 프로필이 복원되는지 확인합니다.
2. 로그아웃하면 로그인 선택 화면으로 돌아오고, 앱을 다시 열어도 로그인 상태가 복원되지 않는지 확인합니다.
3. 새 로그인을 시작했다가 인증 브라우저를 취소해 안전하게 돌아오는지 확인하고, 다시 로그인합니다.

토큰 만료/refresh와 오류·경합 처리는 자동 테스트에도 포함하지만, 배포된 서버에서의 실제 만료 후 갱신 검증과는 구분합니다. 원격 logout 요청은 best-effort이므로 오프라인 로그아웃은 로컬 세션 삭제를 보장하는 범위이며 서버 세션 폐기 성공을 의미하지 않습니다.
