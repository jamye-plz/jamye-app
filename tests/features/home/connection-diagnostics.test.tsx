import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import type { HealthReadiness } from "@/core/contracts/server/domain";
import { HealthApiError } from "@/core/health/health-api";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { ConnectionDiagnostics } from "@/features/home/ui/connection-diagnostics";

const mockLiveness = jest.fn();
const mockReadiness = jest.fn();
jest.mock("@/core/health/health-api", () => {
  const actual = jest.requireActual("@/core/health/health-api");
  return {
    ...actual,
    createHealthApi: jest.fn(() => ({
      liveness: (signal?: AbortSignal) => mockLiveness(signal),
      readiness: (signal?: AbortSignal) => mockReadiness(signal),
    })),
  };
});
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

async function renderDiagnostics() {
  return render(
    <AppThemeProvider>
      <ConnectionDiagnostics />
    </AppThemeProvider>,
  );
}

describe("connection diagnostics (H1/H2)", () => {
  const previousMode = process.env.EXPO_PUBLIC_APP_MODE;
  const previousOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_APP_MODE = "connected-auth";
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://api.example";
    jest.clearAllMocks();
    mockLiveness.mockResolvedValue({ status: "live" });
    mockReadiness.mockResolvedValue({
      status: "ready",
      dependencies: {
        postgres: { status: "ready", required: true },
        redis: { status: "ready", required: true },
        minio: { status: "ready", required: true },
      },
    });
  });
  afterAll(() => {
    process.env.EXPO_PUBLIC_APP_MODE = previousMode;
    process.env.EXPO_PUBLIC_API_ORIGIN = previousOrigin;
  });

  test("shows the live/ready diagnosis results after diagnosing", async () => {
    const screen = await renderDiagnostics();

    await waitFor(() => expect(screen.getByText(/live/)).toBeTruthy());
    expect(screen.getByText("Readiness: ready")).toBeTruthy();
    expect(mockLiveness).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mockReadiness).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  test("never claims readiness proves authentication or feature completion", async () => {
    const screen = await renderDiagnostics();
    expect(
      screen.getByText(/로그인 또는 기능 완료를 의미하지 않습니다/),
    ).toBeTruthy();
  });

  test("shows not_ready and each dependency status without treating it as a request failure", async () => {
    mockReadiness.mockResolvedValue({
      status: "not_ready",
      dependencies: {
        postgres: { status: "ready", required: true },
        redis: { status: "unavailable", required: true },
        minio: { status: "degraded", required: false },
      },
    } satisfies HealthReadiness);
    const screen = await renderDiagnostics();
    expect(screen.getByText("Readiness: not_ready")).toBeTruthy();
    expect(screen.getByText("postgres: ready")).toBeTruthy();
    expect(screen.getByText("redis: unavailable")).toBeTruthy();
    expect(screen.getByText("minio: degraded")).toBeTruthy();
  });

  test("shows a safe error and an explicit retry when readiness fails, independent of a healthy liveness", async () => {
    mockReadiness.mockRejectedValue(new HealthApiError("network_unavailable"));
    const screen = await renderDiagnostics();

    await waitFor(() =>
      expect(screen.getByText(/서버에 연결할 수 없습니다/)).toBeTruthy(),
    );
    expect(screen.getByText(/live/)).toBeTruthy();

    mockLiveness.mockClear();
    mockReadiness.mockClear();
    mockReadiness.mockResolvedValue({
      status: "ready",
      dependencies: {
        postgres: { status: "ready", required: true },
        redis: { status: "ready", required: true },
        minio: { status: "ready", required: true },
      },
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "서버 진단 다시 시도" }),
    );
    await waitFor(() => expect(mockReadiness).toHaveBeenCalledTimes(1));
    expect(mockLiveness).toHaveBeenCalledTimes(1);
  });

  test("prevents a duplicate retry submit while a diagnosis is already in flight", async () => {
    let resolveReadiness: (value: unknown) => void = () => undefined;
    mockReadiness.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReadiness = resolve;
        }),
    );
    const screen = await renderDiagnostics();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    const retryButton = screen.getByRole("button", {
      name: "서버 진단 다시 시도",
    });
    expect(retryButton).toBeDisabled();

    await act(async () => {
      resolveReadiness({
        status: "ready",
        dependencies: {
          postgres: { status: "ready", required: true },
          redis: { status: "ready", required: true },
          minio: { status: "ready", required: true },
        },
      });
    });
    expect(retryButton).toBeEnabled();

    mockReadiness.mockClear();
    mockReadiness.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReadiness = resolve;
        }),
    );
    await fireEvent.press(retryButton);
    await fireEvent.press(retryButton);
    expect(mockReadiness).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveReadiness({
        status: "ready",
        dependencies: {
          postgres: { status: "ready", required: true },
          redis: { status: "ready", required: true },
          minio: { status: "ready", required: true },
        },
      });
    });
  });

  test("cancels the in-flight diagnosis on unmount", async () => {
    let capturedSignal: AbortSignal | undefined;
    mockReadiness.mockImplementation(
      (signal?: AbortSignal) =>
        new Promise(() => {
          capturedSignal = signal;
        }),
    );
    const screen = await renderDiagnostics();
    await act(async () => {
      await Promise.resolve();
    });
    expect(capturedSignal?.aborted).toBe(false);
    await act(async () => {
      screen.unmount();
    });
    expect(capturedSignal?.aborted).toBe(true);
  });
});
