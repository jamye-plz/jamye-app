import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import type { ComponentType, ReactNode } from "react";
import { Text } from "react-native";

type LogSeverity = "debug" | "info" | "warn" | "error";
type ErrorLogger = {
  log: jest.Mock<void, [string, LogSeverity, Record<string, unknown>]>;
};
type AppErrorBoundaryProps = {
  children: ReactNode;
  logger?: ErrorLogger;
};
type ErrorBoundaryModule = { AppErrorBoundary?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingModuleError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return (
    error.code === "MODULE_NOT_FOUND" ||
    (typeof error.message === "string" &&
      error.message.includes("Cannot find module"))
  );
}

function loadAppErrorBoundary(): ComponentType<AppErrorBoundaryProps> {
  let loaded: ErrorBoundaryModule;
  try {
    loaded = jest.requireActual<ErrorBoundaryModule>(
      "../../src/core/errors/app-error-boundary",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M3-I3 implementation missing: src/core/errors/app-error-boundary.tsx must exist before GREEN.",
      );
    }
    throw error;
  }

  if (typeof loaded.AppErrorBoundary !== "function") {
    throw new Error(
      "M3-I3 implementation incomplete: app-error-boundary.tsx must export AppErrorBoundary.",
    );
  }

  return loaded.AppErrorBoundary as ComponentType<AppErrorBoundaryProps>;
}

function createLogger(): ErrorLogger {
  return {
    log: jest.fn<void, [string, LogSeverity, Record<string, unknown>]>(),
  };
}

let consoleErrorSpy: jest.SpyInstance;

beforeEach(() => {
  consoleErrorSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("M3-I3 root Error Boundary contract", () => {
  test("catches a throwing child, reports only safe metadata, and renders an accessible fallback", async () => {
    const AppErrorBoundary = loadAppErrorBoundary();
    const protectedMessage = "opaque-render-failure-message-71c2";
    const logger = createLogger();

    function ThrowingChild(): React.JSX.Element {
      throw new Error(protectedMessage);
    }

    const screen = await render(
      <AppErrorBoundary logger={logger}>
        <ThrowingChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      "app.error-boundary.caught",
      "error",
      { errorName: "Error" },
    );
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain(
      protectedMessage,
    );
  });

  test("retry clears the captured failure and deterministically renders the child again", async () => {
    const AppErrorBoundary = loadAppErrorBoundary();
    const logger = createLogger();
    let shouldThrow = true;

    function RecoverableChild(): React.JSX.Element {
      if (shouldThrow) {
        throw new Error("recoverable-render-failure");
      }
      return <Text>화면이 복구되었습니다.</Text>;
    }

    const screen = await render(
      <AppErrorBoundary logger={logger}>
        <RecoverableChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();

    shouldThrow = false;
    await fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("화면이 복구되었습니다.")).toBeTruthy();
  });
});
