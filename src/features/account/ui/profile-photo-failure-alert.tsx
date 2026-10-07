import type { AvatarFailure } from "@/features/account/model/avatar-upload-failure";
import {
  ACKNOWLEDGE_LABEL,
  CLOSE_LABEL,
  RETRY_LABEL,
} from "@/features/home/ui/account-screen.constants";
import { ConfirmAlert } from "@/shared/ui/confirm-alert";

import { PROFILE_PHOTO_FAILURE_TITLE } from "./profile-photo-menu.shared";

/**
 * AV-AC3/AC4: a failed photo change shows its Korean reason; a retryable one
 * offers `다시 시도`, any other is acknowledge-only. Shared by the iOS and
 * Android account screens; render it inside the screen's `Host` (the alert is
 * native on both platforms).
 */
export function ProfilePhotoFailureAlert({
  failure,
  onRetry,
  onDismiss,
}: Readonly<{
  failure: Pick<AvatarFailure, "message" | "retryable"> | null;
  onRetry: () => void;
  onDismiss: () => void;
}>) {
  return (
    <ConfirmAlert
      acknowledge={failure ? !failure.retryable : undefined}
      cancelLabel={CLOSE_LABEL}
      confirmLabel={failure?.retryable ? RETRY_LABEL : ACKNOWLEDGE_LABEL}
      isPresented={failure !== null}
      message={failure?.message}
      onConfirm={() => (failure?.retryable ? onRetry() : onDismiss())}
      onDismiss={onDismiss}
      testID="profile-photo-failure-alert"
      title={PROFILE_PHOTO_FAILURE_TITLE}
    />
  );
}
