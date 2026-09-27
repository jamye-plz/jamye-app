import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatroomMediaItem } from "@/core/contracts/server/media";

import { useMediaGeneration, useMediaRuntime } from "./media-runtime";
import { useMediaAccess } from "./use-media-access";

const PAGE_LIMIT = 30;
const ERROR_MESSAGE = "갤러리를 불러오지 못했습니다.";

export type ChatroomGalleryStatus =
  "loading" | "idle" | "loading_more" | "refreshing" | "error";

export type ChatroomGalleryState = Readonly<{
  items: readonly ChatroomMediaItem[];
  status: ChatroomGalleryStatus;
  hasMore: boolean;
  errorMessage: string | null;
  loadMore: () => void;
  refresh: () => void;
}>;

/**
 * D4/E10 gallery data for one chatroom's image/video timeline (C5): loads the
 * first page on mount/chatroomId change, supports next-page and refresh, and
 * ignores a `loadMore` while a request for the current `before` cursor is
 * already in flight (`inFlightCursorRef`), so a fast scroll cannot issue
 * duplicate requests for the same page. This is the single gallery data seam
 * -- `topic-media-gallery.tsx`'s carousel section and
 * `chatroom-media-grid-screen.tsx`'s grid both call it instead of touching
 * `media-api`/`use-media-access` directly.
 *
 * `request` never calls `setState` synchronously: everything (including
 * switching to the "loading"/"loading_more"/"refreshing" status) happens
 * after `await Promise.resolve()`, one microtask after the mount effect (or
 * `loadMore`/`refresh`) invokes it. This keeps the mount effect's own body
 * free of direct `setState` calls (react-hooks/set-state-in-effect) without
 * changing the dedupe semantics, which are ref-based and run before the
 * yield.
 */
export function useChatroomGallery(chatroomId: string): ChatroomGalleryState {
  const runtime = useMediaRuntime();
  const access = useMediaAccess();
  const generation = useMediaGeneration(runtime);
  const [items, setItems] = useState<readonly ChatroomMediaItem[]>([]);
  const [status, setStatus] = useState<ChatroomGalleryStatus>("loading");
  const [hasMore, setHasMore] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const inFlightCursorRef = useRef<string | null | undefined>(undefined);

  const request = useCallback(
    (mode: "initial" | "more" | "refresh") => {
      if (!access || !runtime || !runtime.isCurrent(generation))
        return undefined;
      if (mode === "initial") cursorRef.current = null;
      const before =
        mode === "more" ? (cursorRef.current ?? undefined) : undefined;
      if (mode === "more" && inFlightCursorRef.current === (before ?? null))
        return undefined;
      inFlightCursorRef.current = before ?? null;
      const controller = new AbortController();
      void (async () => {
        // Yield one microtask so every setState below is a deferred update,
        // never a synchronous call reachable from the calling effect.
        await Promise.resolve();
        if (controller.signal.aborted) return;
        if (mode === "initial") {
          setItems([]);
          setHasMore(true);
        }
        setStatus(
          mode === "more"
            ? "loading_more"
            : mode === "refresh"
              ? "refreshing"
              : "loading",
        );
        setErrorMessage(null);
        try {
          const page = await access.listChatroomMedia(
            chatroomId,
            { before, limit: PAGE_LIMIT },
            controller.signal,
          );
          if (!runtime.isCurrent(generation)) return;
          cursorRef.current = page.nextCursor;
          inFlightCursorRef.current = undefined;
          setItems((current) =>
            mode === "more" ? [...current, ...page.items] : page.items,
          );
          setHasMore(page.nextCursor !== null);
          setStatus("idle");
        } catch {
          if (!runtime.isCurrent(generation)) return;
          inFlightCursorRef.current = undefined;
          setStatus("error");
          setErrorMessage(ERROR_MESSAGE);
        }
      })();
      return () => controller.abort();
    },
    [access, runtime, generation, chatroomId],
  );

  useEffect(() => {
    inFlightCursorRef.current = undefined;
    return request("initial");
  }, [request]);

  const loadMore = useCallback(() => {
    if (status !== "idle" || !hasMore) return;
    request("more");
  }, [status, hasMore, request]);

  const refresh = useCallback(() => {
    cursorRef.current = null;
    inFlightCursorRef.current = undefined;
    request("refresh");
  }, [request]);

  return { items, status, hasMore, errorMessage, loadMore, refresh };
}
