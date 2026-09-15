import { InlineMessage } from "@/shared/ui/inline-message";
import type { TopicsError } from "../model/topics-state";

const errors: Record<TopicsError, string> = {
  network:
    "응답을 확인하지 못했습니다. 입력을 유지했으니 연결 상태를 확인한 뒤 같은 요청을 재시도해 주세요.",
  unavailable: "서버를 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.",
  unauthorized: "로그인이 필요합니다. 계정 상태를 확인해 주세요.",
  forbidden:
    "이 작업의 권한이 없습니다. 그룹 가입 상태와 작성자 권한을 확인해 주세요.",
  not_found: "주제 또는 그룹을 찾을 수 없습니다.",
  conflict:
    "이전 생성 시도와 충돌합니다. 결과를 확인한 뒤 같은 요청을 재시도해 주세요.",
  validation: "제목·본문·태그 입력값을 확인해 주세요.",
  invalid_response:
    "서버 응답을 확인할 수 없습니다. 주제를 다시 불러와 주세요.",
  storage: "주제를 저장소에서 처리하지 못했습니다. 다시 불러와 주세요.",
};

export function TopicError({ error }: Readonly<{ error: TopicsError | null }>) {
  return error ? <InlineMessage kind="error" message={errors[error]} /> : null;
}
