import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { getPublicEnv } from "@/core/config/public-env";
import type {
  HealthLiveness,
  HealthReadiness,
} from "@/core/contracts/server/domain";
import { HealthApiError, createHealthApi } from "@/core/health/health-api";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";
import { GroupedRow } from "@/shared/ui/grouped-row";
import { NativeButton } from "@/shared/ui/native-button";

type DiagnosticsState =
  | Readonly<{ status: "loading" }>
  | Readonly<{
      status: "ready";
      liveness: HealthLiveness | null;
      livenessError: string | null;
      readiness: HealthReadiness | null;
      readinessError: string | null;
    }>;

function describeHealthError(error: unknown): string {
  if (error instanceof HealthApiError) {
    switch (error.code) {
      case "timeout":
        return "서버 응답이 지연되고 있습니다.";
      case "network_unavailable":
        return "서버에 연결할 수 없습니다.";
      case "invalid_response":
        return "서버 응답 형식이 올바르지 않습니다.";
      case "http_error":
        return "서버가 오류 상태를 반환했습니다.";
      case "cancelled":
        return "진단이 취소되었습니다.";
    }
  }
  return "진단 정보를 불러오지 못했습니다.";
}

export function ConnectionDiagnostics() {
  const { colors } = useAppTheme();
  const env = getPublicEnv();
  const origin = env.apiOrigin;
  if (!origin) throw new Error("connected-auth requires an API origin.");
  const api = useMemo(() => createHealthApi(origin), [origin]);
  const [state, setState] = useState<DiagnosticsState>({ status: "loading" });
  const [runId, setRunId] = useState(0);
  const pendingRef = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    pendingRef.current = true;

    void Promise.allSettled([
      api.liveness(controller.signal),
      api.readiness(controller.signal),
    ]).then(([livenessResult, readinessResult]) => {
      if (controller.signal.aborted) return;
      pendingRef.current = false;
      setState({
        liveness:
          livenessResult.status === "fulfilled" ? livenessResult.value : null,
        livenessError:
          livenessResult.status === "rejected"
            ? describeHealthError(livenessResult.reason)
            : null,
        readiness:
          readinessResult.status === "fulfilled" ? readinessResult.value : null,
        readinessError:
          readinessResult.status === "rejected"
            ? describeHealthError(readinessResult.reason)
            : null,
        status: "ready",
      });
    });

    return () => {
      pendingRef.current = false;
      controller.abort();
    };
  }, [api, runId]);

  const retry = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setState({ status: "loading" });
    setRunId((value) => value + 1);
  }, []);

  const disabled = state.status === "loading";

  return (
    <View style={{ gap: appSpacing.sm, paddingVertical: appSpacing.sm }}>
      <AppText
        color={colors.textMuted}
        style={{ paddingHorizontal: appSpacing.md }}
        variant="footnote"
      >
        진단 결과는 서버 연결 상태 확인용이며 로그인 또는 기능 완료를 의미하지
        않습니다.
      </AppText>
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole={disabled ? "progressbar" : undefined}
        accessible={disabled}
      >
        {state.status === "loading" ? (
          <GroupedRow title="진단 중…" />
        ) : (
          <>
            <GroupedRow
              title={`Liveness: ${state.liveness?.status ?? state.livenessError}`}
            />
            <GroupedRow
              title={`Readiness: ${state.readiness?.status ?? state.readinessError}`}
            />
            {state.readiness &&
              Object.entries(state.readiness.dependencies).map(
                ([name, dependency]) => (
                  <GroupedRow
                    key={name}
                    title={`${name}: ${dependency.status}`}
                  />
                ),
              )}
          </>
        )}
      </View>
      <NativeButton
        disabled={disabled}
        label="서버 진단 다시 시도"
        onPress={retry}
        variant="text"
      />
    </View>
  );
}
