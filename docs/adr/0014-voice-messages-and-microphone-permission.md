# ADR 0014: 대화방 음성 메시지와 마이크 권한

- 상태: Accepted (2026-09-27 사용자 결정; M14 라운드 2 구현과 기기 검증 반영)
- 결정일: 2026-09-27
- 적용 마일스톤: M14 라운드 2부터
- 대체하는 결정: M5 시기의 '마이크·녹음 없음' 결정([product-intent.md](../product-intent.md) §4.3의
  이전 문구 "media, microphone, recording state는 composer에 자리만 예약하거나 skeleton을 만들지
  않고 backlog로 남긴다")
- 관련 결정: [ADR 0010](0010-platform-native-visual-language.md),
  [ADR 0011](0011-color-system-platform-neutral-berry-highlight.md),
  [ADR 0013](0013-jamye-ui-local-native-module.md)

## 맥락

M14 라운드 2 범위는 로그인·계정·알림·대화방(그룹 기본 대화방과 주제 대화방) 네이티브 UI에 더해
사진·동영상·음성 첨부를 포함한다. 사진·동영상은 갤러리에서 고르지만, 음성은 대화방 안에서 직접
녹음해 보낼 수 있어야 한다는 것이 사용자 요청이었다. 서버는 이미 오디오 첨부(정확히 1개, 본문 없이,
`audio/webm`·`audio/mp4`·`audio/ogg`, 최대 15 MiB, 최대 330초, symphonia demux로 길이를 읽음)를
지원하지만 지금까지 앱에는 마이크로 녹음하는 경로가 없었고, M5 시기 결정은 마이크·녹음 기능 자체를
범위 밖으로 미뤄 뒀다.

마이크를 쓰려면 `expo-audio`(SDK 번들 버전이 아닌 명시적 의존성)가 필요하고, iOS
`NSMicrophoneUsageDescription`과 Android `RECORD_AUDIO` 권한 문구를 새로 정해야 한다. 기존
`expo-image-picker` 플러그인 설정(`microphonePermission: false`)은 Android에서 `RECORD_AUDIO`를
`tools:node="remove"`로 지우고 iOS 마이크 키를 지우므로, `expo-audio`의 권한 요청과 충돌한다.

## 결정

### D1. 녹음 흐름: 탭해서 녹음 → 미리 듣고 보내기, 3:00 앱 자동 정지

마이크를 탭하면 녹음이 시작된다(마이크 권한은 앱 시작이 아니라 이 첫 탭에서 요청한다). 입력창은
녹음 막대로 바뀐다: 빨간 점, 경과 시간, 실시간 소리 크기 막대(`expo-audio`의 dBFS metering을
0..1로 정규화), `삭제`, `정지`. 정지하면 미리 듣기 막대(재생/일시정지, 진행, 길이, `삭제`, 보내기)로
바뀌고 업로드가 즉시 시작되며, 업로드가 끝나면 보내기가 활성화된다. 사용자 메모에 따라 앱은 3:00
(180초)에 자동으로 녹음을 멈춘다(`VOICE_RECORDING_MAX_MS`) — 서버의 330초 한도와는 별개의, 더 짧은
앱 쪽 상한이다. 1초 미만 녹음은 전송하지 않는다(서버 duration 최소 1초 규칙과 정합).

**기각한 대안**: 서버 한도(330초)까지 녹음을 허용. 사용자가 명시적으로 3:00 자동 정지를 요청했고,
채팅 음성 메시지는 짧은 대화 조각이 목적이라는 제품 의도(대화가 제품의 본체라는
[product-intent.md](../product-intent.md) §3.1)에도 맞지 않는다.

### D2. 재생: 말풍선 안 재생/탐색, 한 번에 하나만, 무음 모드에서도 재생

음성 메시지는 자체 말풍선으로 렌더한다: 재생/일시정지 버튼, 끌어서 이동 가능한 진행 막대, 길이
라벨(서버가 준 길이, 재생 중에는 경과 시간). 앱 전체에서 음성이든 동영상이든 한 번에 하나만
재생되도록 `audio-playback-coordinator.ts`가 활성 재생을 조정한다. iOS는 무음 스위치가 켜져 있어도
재생되도록 오디오 세션을 구성한다.

### D3. 중단 처리: 백그라운드·전화는 정지 후 미리듣기 유지, 대화방 이탈은 삭제

녹음 중 앱이 백그라운드로 가거나 전화가 오면 녹음을 멈추고 그때까지 녹음된 내용을 미리듣기 상태로
유지한다(버리지 않는다). 앱으로 돌아오면 사용자가 듣고 보내거나 삭제할 수 있다. 대화방 화면을
나가면(뒤로 가기, unmount) 녹음본과 업로드 초안을 삭제한다. 배경 녹음(`UIBackgroundModes: audio`)은
쓰지 않는다 — 짧은 메시지 녹음에 필요하지 않고 백그라운드 오디오 세션 정책과 배터리 영향을 늘린다.

**기각한 대안**: 백그라운드에서도 녹음을 계속하고 전경 복귀 시 이어 붙이기. 서버 330초 상한과 앱
180초 상한을 포그라운드 세션 하나로 검증하기 어렵고, 사용자 결정(V4)이 명시적으로 "멈추고
미리듣기로 유지"를 지정했다.

### D4. 의존성과 마이크 권한 문구

`expo-audio`(녹음·재생)와 `expo-haptics`(iOS 전용: 녹음 시작·정지·전송 햅틱; Android는 사용하지
않는다)를 추가한다. 녹음 형식은 `expo-audio`의 `RecordingPresets.HIGH_QUALITY`(AAC, `.m4a`)이고
업로드 content type은 `audio/mp4`다(180초 × 약 128kbps ≈ 3MB, 서버 15 MiB 한도 안). 마이크 권한
문구는 다음과 같다.

> 대화방에서 음성 메시지를 녹음하기 위해 마이크를 사용합니다.

Android는 `RECORD_AUDIO`를 요청한다. `expo-image-picker` 플러그인의 `microphonePermission: false`
설정을 제거해 `expo-audio`의 권한 등록과 충돌하지 않도록 한다(카메라 권한은 계속 요청하지 않는다).
품질 검사기(`tools/quality/check-architecture.cjs`)의 승인된 의존성·플러그인 고정값을 함께
갱신한다.

**기각한 대안**: `expo-av`(레거시 통합 오디오/비디오 API)를 재사용. Expo SDK 57은 `expo-audio`/
`expo-video`로 분리된 모듈을 권장하고, 앱은 이미 M11에서 `expo-video`를 도입했으므로 같은 세대의
오디오 모듈을 맞춰 쓰는 편이 두 모듈의 향후 업그레이드 경로를 하나로 유지한다.

### D5. 기존 파일 기반 음성 첨부 제거

`+`를 눌러 파일 앱에서 오디오 파일을 고르던 기존 `음성 파일 첨부` 옵션과 `audio-file-picker.ts`,
그 테스트, 관련 UI 문구를 제거한다. 마이크 녹음이 유일한 음성 입력 경로가 된다. 다른 사용처가 없는
`expo-document-picker` 의존성도 함께 제거한다. 서버에서 받은 기존 음성 첨부(과거에 파일로 보낸
메시지 포함)는 D2의 재생 경로로 그대로 재생된다 — 전송 경로만 바뀌고 수신·재생 경로는 형식에
무관하다.

## 대안

- **음성 메시지를 이번 범위에서 제외**: 사용자가 명시적으로 로그인·계정·알림·대화방과 함께 음성
  첨부를 범위에 포함해 달라고 요청했으므로 기각.
- **서버에 파형(waveform) 데이터를 요청해 미리듣기 막대에 그래프를 그림**: 서버 계약에 파형 필드가
  없고, 이번 라운드는 계약 변경 없이 기존 오디오 첨부 계약(정확히 1개, 본문 없음, 길이만 제공)
  위에서 구현한다. 파형은 범위 밖으로 남긴다.
- **`expo-av`로 통합 구현**(D4 참고): 기각.

## 결과

- 장점: 대화방에서 사진·동영상과 나란히 음성을 즉시 녹음해 보낼 수 있어, 텍스트만 가능했던 M5 시기
  제약을 없앤다. 기존 서버 오디오 첨부 계약을 그대로 재사용해 계약 변경이나 migration이 필요 없다.
- 비용: `expo-audio`·`expo-haptics` 추가로 native rebuild(clean prebuild + iOS/Android dev client
  재빌드·설치)가 필요했다. 마이크 권한을 새로 요청하므로 권한 거부 시 사용자 안내(설정 열기 등,
  A3 계정 화면 규칙)와 함께 검토해야 한다.
- 제약: 앱 녹음 상한(180초)과 서버 한도(330초)가 다르므로 두 상한을 착각하지 않도록 상수 이름과
  주석에 출처를 명시한다(`VOICE_RECORDING_MAX_MS`는 앱 쪽, 서버 330초는 별개).

## 검증

- 자동 테스트: `tests/features/media/**`의 recorder/player/voice-recorder-bar/voice-message-bubble
  focused 테스트, `tests/features/chat/chat-composer*`의 녹음·업로드·전송 상태 테스트.
- Native 권한 검사: 생성된 iOS `Info.plist`의 `NSMicrophoneUsageDescription` 값과 Android
  `AndroidManifest.xml`의 `RECORD_AUDIO`(제거 마커 없음), `CAMERA` 권한 부재를 자동 검사로
  확인했다(task-app-native).
- 기기 스모크: iOS 시뮬레이터·Android 에뮬레이터에서 마이크 권한 프롬프트가 첫 탭에만 뜨는 것을
  확인했다(`android-mic-permission-first-tap.png`). 3:00 자동 정지, 백그라운드·전화 중단, 재생·탐색
  막대의 전체 기기 검증은 이 세션 종료 시점에 아직 완료되지 않았다 —
  [M14 evidence](../evidence/M14.md)의 "라운드 2" 절 "확인 대기"에 남겨 둔다.
