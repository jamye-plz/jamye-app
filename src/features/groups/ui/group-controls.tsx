import { InlineMessage } from "@/shared/ui/inline-message";
import type { GroupsErrorOutcome } from "../model/groups-error";

export function groupErrorMessage(error: GroupsErrorOutcome): string {
  switch (error.kind) {
    case "validation":
      return "입력값을 확인해 주세요.";
    case "membership_required":
      return "이 그룹에 접근할 수 없습니다. 가입 상태를 확인해 주세요.";
    case "owner_required":
      return "그룹 소유자만 할 수 있습니다. 현재 권한을 다시 확인합니다.";
    case "not_found":
      return error.code === "invite_not_found"
        ? "초대 코드를 찾을 수 없습니다."
        : error.code === "member_not_found"
          ? "해당 멤버를 찾을 수 없습니다."
          : "그룹을 찾을 수 없습니다.";
    case "conflict":
      return error.code === "group_full"
        ? "그룹 정원이 가득 찼습니다."
        : error.code === "group_owner_conflict"
          ? "소유권을 먼저 다른 멤버에게 넘겨 주세요."
          : "그룹 상태가 변경되었습니다. 새로고침 후 확인해 주세요.";
    case "invite_terminal":
      return error.code === "invite_expired"
        ? "만료된 초대 코드입니다."
        : "사용 횟수를 모두 소진한 초대 코드입니다.";
    case "rate_limited":
      return error.retryAfterSeconds === null
        ? "요청이 많습니다. 잠시 후 다시 시도해 주세요."
        : `요청이 많습니다. ${error.retryAfterSeconds}초 후 다시 시도해 주세요.`;
    case "service_unavailable":
      return "지금은 서버를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    case "network":
      return "응답을 확인하지 못했습니다. 연결 상태를 확인해 주세요.";
    case "cancelled":
      return "요청이 취소되었습니다.";
    case "unknown":
      return "요청 결과를 확인할 수 없습니다. 다시 불러와 확인해 주세요.";
  }
}

export function GroupError({
  error,
}: Readonly<{ error: GroupsErrorOutcome | null }>) {
  return error ? (
    <InlineMessage kind="error" message={groupErrorMessage(error)} />
  ) : null;
}
