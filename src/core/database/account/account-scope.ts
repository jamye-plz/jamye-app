import { openAccountDatabase as defaultOpenAccountDatabase } from "./open-account-database";
import type { AccountPrincipal } from "./types";
import type { ConnectedChatRepository } from "./connected-chat-types";
import type { SqliteRepositoryDatabase } from "../types";

export type AccountScopeHandle = Readonly<{
  close: () => Promise<void>;
  database: SqliteRepositoryDatabase;
  connectedChatRepository: ConnectedChatRepository;
}>;

export type AccountScopeOpenPort = (
  principal: AccountPrincipal,
) => Promise<AccountScopeHandle>;

export type AccountScopeRenderedState =
  | null
  | Readonly<{ status: "opening" }>
  | Readonly<{
      database: SqliteRepositoryDatabase;
      connectedChatRepository: ConnectedChatRepository;
      status: "ready";
    }>
  | Readonly<{ error: Error; status: "error" }>;

export type AccountScopeController = Readonly<{
  getState: () => AccountScopeRenderedState;
  setPrincipal: (principal: AccountPrincipal | null) => void;
  subscribe: (listener: () => void) => () => void;
}>;

type Attempt = { disposed: boolean };

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

export function createAccountScope(
  openAccountDatabase: AccountScopeOpenPort = defaultOpenAccountDatabase,
): AccountScopeController {
  const listeners = new Set<() => void>();
  let state: AccountScopeRenderedState = null;
  let activeAttempt: Attempt | null = null;
  let activeHandle: AccountScopeHandle | null = null;
  // Serialize opens as well as closes: a late abandoned open must not escape
  // the drain, and two attempts must not concurrently initialize the same file.
  let transition: Promise<void> | null = null;

  function notify(): void {
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // Subscribers are best-effort observers of scope state.
      }
    });
  }

  function publish(next: AccountScopeRenderedState): void {
    state = next;
    notify();
  }

  async function closeActiveHandle(): Promise<void> {
    const handle = activeHandle;
    if (!handle) return;
    await handle.close();
    // Keep failed handles so a later explicit attempt retries their closure.
    activeHandle = null;
  }

  function setPrincipal(principal: AccountPrincipal | null): void {
    if (activeAttempt) activeAttempt.disposed = true;
    const attempt: Attempt = { disposed: false };
    activeAttempt = attempt;
    publish(principal ? { status: "opening" } : null);

    const reconcile = async () => {
      try {
        if (activeHandle) await closeActiveHandle();
        if (attempt.disposed || !principal) return;
        const handle = await openAccountDatabase(principal);
        activeHandle = handle;
        if (attempt.disposed) {
          await closeActiveHandle();
          return;
        }
        publish({
          database: handle.database,
          connectedChatRepository: handle.connectedChatRepository,
          status: "ready",
        });
      } catch (error) {
        if (!attempt.disposed && principal) {
          publish({ error: toError(error), status: "error" });
        }
      }
    };
    const next = transition ? transition.then(reconcile) : reconcile();
    transition = next;
    void next.then(() => {
      if (transition === next) transition = null;
    });
  }

  return {
    getState: () => state,
    setPrincipal,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
