import * as SecureStore from "expo-secure-store";

import type { TokenPair } from "./types";

const SESSION_KEY = "jamye.auth.session.v1";

export type SessionStore = Readonly<{
  load: (origin: string) => Promise<TokenPair | null>;
  save: (origin: string, tokens: TokenPair) => Promise<void>;
  clear: () => Promise<void>;
}>;

type SecureStorePort = Readonly<{
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
}>;

export function createSecureSessionStore(
  storage: SecureStorePort,
): SessionStore {
  return {
    async load(origin) {
      const value = await storage.getItemAsync(SESSION_KEY);
      if (!value) return null;
      try {
        const parsed: unknown = JSON.parse(value);
        if (
          !isRecord(parsed) ||
          parsed.origin !== origin ||
          !isTokenPair(parsed.tokens)
        )
          throw new Error("invalid");
        return parsed.tokens;
      } catch {
        await storage.deleteItemAsync(SESSION_KEY);
        return null;
      }
    },
    save: async (origin, tokens) =>
      storage.setItemAsync(SESSION_KEY, JSON.stringify({ origin, tokens })),
    clear: async () => storage.deleteItemAsync(SESSION_KEY),
  };
}

export const secureSessionStore = createSecureSessionStore(SecureStore);

function isTokenPair(value: unknown): value is TokenPair {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return [
    "accessToken",
    "accessTokenExpiresAt",
    "refreshToken",
    "refreshTokenExpiresAt",
  ].every(
    (key) => typeof candidate[key] === "string" && candidate[key].length > 0,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
