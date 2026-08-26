import { Component, Fragment } from "react";
import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, useColorScheme } from "react-native";

import {
  createLogger,
  type LoggerSink,
  type StructuredLogger,
} from "@/core/logging/logger";
import {
  appControl,
  appRadii,
  appSpacing,
  resolveSystemTheme,
} from "@/core/theme/tokens";
import { AppScreen } from "@/shared/ui/app-screen";
import { AppText } from "@/shared/ui/app-text";

type AppErrorBoundaryProps = PropsWithChildren<{
  logger?: StructuredLogger;
}>;

type AppErrorBoundaryState = {
  hasError: boolean;
  resetKey: number;
};

type AppErrorFallbackProps = {
  onRetry: () => void;
};

const localConsoleSink: LoggerSink = {
  debug: (record) => console.debug(record),
  info: (record) => console.info(record),
  warn: (record) => console.warn(record),
  error: (record) => console.error(record),
};

const defaultLogger = createLogger(localConsoleSink);

function normalizeErrorName(error: Error): string {
  const name = error.name;
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : "Error";
}

function AppErrorFallback({ onRetry }: AppErrorFallbackProps) {
  const theme = resolveSystemTheme(useColorScheme());

  return (
    <AppScreen
      backgroundColor={theme.colors.background}
      contentStyle={styles.fallbackContent}
    >
      <AppText
        accessibilityRole="header"
        color={theme.colors.text}
        variant="title"
      >
        앱 화면을 표시하지 못했습니다.
      </AppText>
      <AppText
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        color={theme.colors.textMuted}
      >
        잠시 후 다시 시도해 주세요.
      </AppText>
      <Pressable
        accessibilityLabel="다시 시도"
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryButton,
          {
            backgroundColor: theme.colors.primary,
            opacity: pressed ? 0.84 : 1,
          },
        ]}
      >
        <AppText color={theme.colors.onPrimary} variant="label">
          다시 시도
        </AppText>
      </Pressable>
    </AppScreen>
  );
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    resetKey: 0,
  };

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    const logger = this.props.logger ?? defaultLogger;
    logger.log("app.error-boundary.caught", "error", {
      errorName: normalizeErrorName(error),
    });
  }

  private readonly handleRetry = (): void => {
    this.setState(({ resetKey }) => ({
      hasError: false,
      resetKey: resetKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return <AppErrorFallback onRetry={this.handleRetry} />;
    }

    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}

const styles = StyleSheet.create({
  fallbackContent: {
    alignItems: "flex-start",
    gap: appSpacing.md,
    justifyContent: "center",
  },
  retryButton: {
    alignItems: "center",
    borderRadius: appRadii.large,
    justifyContent: "center",
    minHeight: appControl.standardHeight,
    paddingHorizontal: appSpacing.lg,
  },
});
