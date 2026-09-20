/**
 * Device-scoped push installation identity, persisted via expo-secure-store.
 * Mirrors `src/core/auth/secure-session-store.ts`'s injection conventions
 * (a narrow storage port + a `create*` factory + a production singleton)
 * so this stays testable without the real native secure-storage module.
 *
 * The id is generated once per app install and reused across every
 * login/logout/account switch on the same device: the server's
 * PushInstallation lifecycle (register/update/delete, disabled_at cleanup)
 * treats installation_id as a device identity, not an account identity.
 */
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";

const INSTALLATION_ID_KEY = "jamye.push.installation-id.v1";
const MAX_INSTALLATION_ID_LENGTH = 255;

export type InstallationIdStore = Readonly<{
  /** Resolves the device's installation id, generating and persisting one on first use. */
  getOrCreate: () => Promise<string>;
}>;

type SecureStorePort = Readonly<{
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
}>;

function isValidPersistedId(value: string): boolean {
  return value.length > 0 && value.length <= MAX_INSTALLATION_ID_LENGTH;
}

export function createInstallationIdStore(
  storage: SecureStorePort,
  generateId: () => string = randomUUID,
): InstallationIdStore {
  let inFlight: Promise<string> | null = null;

  return {
    getOrCreate() {
      if (inFlight) return inFlight;
      const attempt = (async () => {
        const existing = await storage.getItemAsync(INSTALLATION_ID_KEY);
        if (existing && isValidPersistedId(existing)) return existing;
        const created = generateId();
        await storage.setItemAsync(INSTALLATION_ID_KEY, created);
        return created;
      })();
      inFlight = attempt;
      // Concurrent callers within this in-flight window share the same
      // promise (single-flight); once it settles, a later call re-reads
      // storage fresh rather than caching the id in this closure forever.
      // Both branches are handled here so a storage failure surfaces only
      // to the caller of `getOrCreate()`, never as a second, unhandled
      // rejection from the bookkeeping promise.
      const release = () => {
        if (inFlight === attempt) inFlight = null;
      };
      void attempt.then(release, release);
      return attempt;
    },
  };
}

export const installationIdStore = createInstallationIdStore(SecureStore);
