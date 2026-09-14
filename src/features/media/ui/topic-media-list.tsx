import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appSpacing } from "@/core/theme/tokens";
import type {
  TopicMediaEntry,
  TopicMediaEntryPage,
} from "@/core/contracts/server/media";
import { useMediaAccess } from "@/features/media/model/use-media-access";
import { useMediaGeneration, useMediaRuntime } from "../model/media-runtime";
import { MediaImage } from "./media-image";
import { MediaOpenSaveButton } from "./media-open-save-button";

type ListState =
  | Readonly<{ status: "loading" }>
  | Readonly<{
      status: "ready";
      items: readonly TopicMediaEntry[];
      nextCursor: string | null;
    }>
  | Readonly<{ status: "error" }>;

/** MD3 opaque-cursor topic media listing. Membership/manage gating stays with the
 * caller (`topic-detail-screen.tsx`); this component only renders whatever page the
 * shared `MediaRuntime` (`useMediaAccess`) returns for `topicId`. */
export function TopicMediaList({ topicId }: Readonly<{ topicId: string }>) {
  const { colors } = useAppTheme();
  const access = useMediaAccess();
  const runtime = useMediaRuntime();
  const generation = useMediaGeneration(runtime);
  const operationRef = useRef({
    active: false,
    controller: null as AbortController | null,
  });
  const [loaded, setLoaded] = useState<{
    key: string;
    value: ListState;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const viewKey = `${runtime?.accountKey}:${topicId}:${generation}:${attempt}`;
  const state = useMemo<ListState>(
    () => (loaded?.key === viewKey ? loaded.value : { status: "loading" }),
    [loaded, viewKey],
  );

  useFocusEffect(
    useCallback(() => {
      if (!access || !runtime || !runtime.isCurrent(generation)) return;
      const operation = operationRef.current;
      operation.active = true;
      const controller = new AbortController();
      operation.controller = controller;
      const current = () =>
        operation.active &&
        !controller.signal.aborted &&
        runtime.isCurrent(generation);
      const unsubscribe = runtime.subscribeInvalidation(() =>
        operation.controller?.abort(),
      );
      const run = async () => {
        try {
          const page: TopicMediaEntryPage = await access.listTopicMedia(
            topicId,
            {},
            controller.signal,
          );
          if (!current()) return;
          setLoaded({
            key: viewKey,
            value: {
              status: "ready",
              items: page.items,
              nextCursor: page.nextCursor,
            },
          });
          setPageError(null);
          setLoadingMore(false);
        } catch {
          if (current())
            setLoaded({ key: viewKey, value: { status: "error" } });
        } finally {
          if (operation.controller === controller) operation.controller = null;
        }
      };
      void run();
      return () => {
        operation.active = false;
        operation.controller?.abort();
        controller.abort();
        unsubscribe();
      };
    }, [access, runtime, topicId, generation, viewKey]),
  );

  const retryFirstPage = () => {
    setAttempt((value) => value + 1);
  };

  const loadMore = useCallback(async () => {
    const operation = operationRef.current;
    if (
      !access ||
      !runtime ||
      !operation.active ||
      operation.controller ||
      !runtime.isCurrent(generation) ||
      state.status !== "ready" ||
      state.nextCursor === null
    )
      return;
    const controller = new AbortController();
    operation.controller = controller;
    const current = () =>
      operation.active &&
      !controller.signal.aborted &&
      runtime.isCurrent(generation);
    setLoadingMore(true);
    setPageError(null);
    try {
      const page = await access.listTopicMedia(
        topicId,
        { after: state.nextCursor },
        controller.signal,
      );
      if (!current()) return;
      if (page.nextCursor === state.nextCursor)
        throw new Error("media_cursor_did_not_advance");
      setLoaded((previous) => {
        if (previous?.key !== viewKey || previous.value.status !== "ready")
          return previous;
        const byId = new Map(
          previous.value.items.map((item) => [item.id, item]),
        );
        for (const item of page.items) byId.set(item.id, item);
        return {
          key: viewKey,
          value: {
            status: "ready",
            items: [...byId.values()],
            nextCursor: page.nextCursor,
          },
        };
      });
    } catch {
      if (current())
        setPageError("이미지를 더 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if (operation.controller === controller) operation.controller = null;
      if (current()) setLoadingMore(false);
    }
  }, [access, runtime, state, topicId, generation, viewKey]);

  if (!access)
    return (
      <Text style={{ color: colors.textMuted }}>
        미디어를 사용할 수 없습니다.
      </Text>
    );
  if (state.status === "loading")
    return <Text style={{ color: colors.textMuted }}>미디어 불러오는 중…</Text>;
  if (state.status === "error")
    return (
      <View style={{ gap: appSpacing.xxs }}>
        <Text style={{ color: colors.error }}>
          미디어 목록을 불러오지 못했습니다.
        </Text>
        <Pressable
          accessibilityLabel="미디어 목록 다시 불러오기"
          accessibilityRole="button"
          onPress={retryFirstPage}
          style={{
            justifyContent: "center",
            minHeight: appControl.standardHeight,
          }}
        >
          <Text style={{ color: colors.primary }}>다시 시도</Text>
        </Pressable>
      </View>
    );
  if (state.items.length === 0)
    return (
      <Text style={{ color: colors.textMuted }}>등록된 이미지가 없습니다.</Text>
    );
  return (
    <View style={{ gap: appSpacing.xs }}>
      <FlatList
        data={state.items}
        horizontal
        ItemSeparatorComponent={() => <View style={{ width: appSpacing.xs }} />}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View>
            <MediaImage filename={null} mediaId={item.id} />
            <MediaOpenSaveButton
              filename={null}
              contentType={item.contentType}
              mediaId={item.id}
            />
          </View>
        )}
      />
      {pageError ? (
        <Text style={{ color: colors.error }}>{pageError}</Text>
      ) : null}
      {state.nextCursor !== null ? (
        <Pressable
          accessibilityLabel="이미지 더 보기"
          accessibilityRole="button"
          accessibilityState={{ busy: loadingMore, disabled: loadingMore }}
          disabled={loadingMore}
          onPress={() => void loadMore()}
          style={{
            justifyContent: "center",
            minHeight: appControl.standardHeight,
          }}
        >
          <Text style={{ color: colors.primary }}>
            {loadingMore ? "불러오는 중…" : "더 보기"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
