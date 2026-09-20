import {
  mapNotificationPage,
  validateNotificationPage,
} from "@/core/contracts/server";
import type { NotificationPage } from "@/core/contracts/server";

import { createHttpRequester } from "./notifications-http";

const NOTIFICATION_IDENTIFIER_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class NotificationApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
  }
}

export type NotificationPageParams = Readonly<{
  after?: string;
  limit?: number;
}>;

export type NotificationsApi = Readonly<{
  listNotifications: (
    accessToken: string,
    params: NotificationPageParams,
    signal?: AbortSignal,
  ) => Promise<NotificationPage>;
  markNotificationRead: (
    accessToken: string,
    notificationId: string,
    signal?: AbortSignal,
  ) => Promise<void>;
}>;

function validateLimit(limit: number | undefined): void {
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > 100)
  ) {
    throw new NotificationApiError(422, "invalid_page_limit");
  }
}

function buildPageQuery(
  after: string | undefined,
  limit: number | undefined,
): string {
  const query = new URLSearchParams();
  if (after !== undefined) query.set("after", after);
  if (limit !== undefined) query.set("limit", String(limit));
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function identifier(value: string): string {
  if (!NOTIFICATION_IDENTIFIER_PATTERN.test(value))
    throw new NotificationApiError(422, "invalid_identifier");
  return encodeURIComponent(value);
}

export function createNotificationsApi(origin: string): NotificationsApi {
  const request = createHttpRequester(
    origin,
    (status, code, retryAfterSeconds = null) =>
      new NotificationApiError(status, code, retryAfterSeconds),
    (error): error is NotificationApiError =>
      error instanceof NotificationApiError,
  );

  return {
    async listNotifications(accessToken, params, signal) {
      validateLimit(params.limit);
      const { payload } = await request(
        `/api/v1/notifications${buildPageQuery(params.after, params.limit)}`,
        accessToken,
        {},
        signal,
        [200],
      );
      if (!validateNotificationPage(payload))
        throw new NotificationApiError(
          502,
          "invalid_notification_page_response",
        );
      return mapNotificationPage(payload);
    },
    async markNotificationRead(accessToken, notificationId, signal) {
      const encodedId = identifier(notificationId);
      try {
        await request(
          `/api/v1/notifications/${encodedId}/read`,
          accessToken,
          { method: "POST" },
          signal,
          [204],
        );
      } catch (error) {
        // 403/404 are surfaced under dedicated codes (distinct from generic
        // request_failed) so the UI can render "더 이상 접근할 수 없는 알림"
        // instead of a generic error message.
        if (error instanceof NotificationApiError) {
          if (error.status === 403)
            throw new NotificationApiError(403, "notification_forbidden");
          if (error.status === 404)
            throw new NotificationApiError(404, "notification_not_found");
        }
        throw error;
      }
    },
  };
}
