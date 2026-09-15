# ADR 0006: 영상 미리보기 신뢰성 안정화와 발신 단말 포스터 도입

- 상태: Accepted
- 결정일: 2026-09-15
- 적용 마일스톤: M11 연장

## 맥락

채팅 영상 미리보기는 수신 단말이 원본 MP4 전체를 내려받아 t=0 프레임을 추출하는 방식이었다.
실패 사유가 기록되지 않고, 재생 시 같은 파일을 다시 받으며, 가시성이 짧게 꺼지면 진행 중
다운로드를 취소·재시작해 iOS에서 3분 동안 24회 재요청이 관찰됐다. 서버 계약에는 포스터 개념이
없어 근본 해결은 서버(jamye-server [ADR 0009](../../../jamye-server/docs/adr/0009-media-posters.md))와
함께 진행해야 했다.

## 결정

1. **즉시(client)**: 썸네일 실패를 `media.video-thumbnail.failed`로 `stage`/`code`를 구조화해
   로깅하고, 120초 워치독을 큐 작업이 실제로 시작될 때로 옮긴다. 프레임 추출은 0.5초를 먼저
   시도하고 실패하면 1.5초로 재시도하며 원인을 `thumbnail_unavailable:<stage>:<code>`로 보존한다.
   가시성이 꺼져도 5초 그레이스 동안 작업을 유지하고 그 안에 다시 켜지면 재사용한다.
   mediaId 단위 캐시(`video-thumbnail-cache.ts`)로 재마운트 시 재다운로드를 막고, 수동 재시도를
   3회까지 허용한다.
2. **중기(client)**: 미리보기와 재생이 같은 다운로드를 공유한다. `media-object-cache.ts`가
   `retainDownloadedFile`/`removeDownloadedFile` 위에 retain count와 60초 보존 창을 두어,
   `use-media-video.ts`(재생)와 썸네일 경로(미리보기)가 하나의 다운로드를 재사용한다.
3. **근본(server+client)**: 발신 단말이 첨부 시점에 로컬 영상에서 JPEG 포스터를 생성해 별도
   `media_uploads` 업로드로 올리고, 영상 finalize에 `posterUploadId`로 연결한다
   (`media-upload-controller.ts`의 4단계 sub-pipeline: 생성 → intent → PUT → finalize).
   포스터 생성·업로드 실패는 영상 전송을 막지 않고 `media.poster.failed`로만 기록한다.
   수신 단말은 `MessageAttachment.posterMediaId`가 있으면 JPEG 포스터만 받아 표시하고,
   없는 과거 메시지는 기존 로컬 프레임 추출 경로로 fallback한다.

## 결과

- 계약 intake(`bun tools/contracts/intake-server-contract.mjs`)로 `poster_upload_id`/
  `poster_media_id`를 `contracts/server/*`와 `src/core/contracts/server/{media,domain}.ts`에
  반영하고 `check-server-contract.mjs`(CONTRACT_GATE) PASS를 확인했다.
- `bun run check:code`(typecheck·lint·format·check:architecture·coverage) PASS.
- 실기기에서의 포스터 송수신 E2E 확인은 서버(ADR 0009) 배포 후로 미룬다. 이번 세션은 로컬
  자동 검증까지만 완료했고 native rebuild는 수행하지 않았다(JS/TS 변경만).
