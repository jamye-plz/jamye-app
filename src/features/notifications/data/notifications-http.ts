/**
 * Thin re-export: the actual HTTP boilerplate now lives in the core module
 * (`@/core/http/http-requester`) so it can be reused outside the
 * notifications feature (e.g. `src/features/account/data/account-api.ts`).
 * This file stays so `notifications-api.ts`, `push-installations-api.ts`,
 * and their tests keep importing from the same relative path unchanged.
 */
export {
  createHttpRequester,
  parseRetryAfterSeconds,
} from "@/core/http/http-requester";
export type { HttpRequestFn } from "@/core/http/http-requester";
