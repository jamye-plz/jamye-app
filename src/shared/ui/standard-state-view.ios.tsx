import {
  Button,
  ContentUnavailableView,
  ProgressView,
  Text,
  VStack,
} from "@expo/ui/swift-ui";
import { buttonStyle, fixedSize, frame } from "@expo/ui/swift-ui/modifiers";
import { Platform } from "react-native";

import { APP_SYMBOLS } from "./app-symbol";
import type {
  StandardStateViewErrorRowProps,
  StandardStateViewProps,
} from "./standard-state-view.types";

export type * from "./standard-state-view.types";

const DEFAULT_RETRY_LABEL = "다시 시도";
const LIQUID_GLASS_MIN_MAJOR_VERSION = 26;

/**
 * Whether the running iOS/tvOS version supports the Liquid Glass
 * `buttonStyle`s (`glass`/`glassProminent`, iOS 26+). Takes the version as a
 * parameter (rather than reading `Platform.Version` itself) so every branch
 * is directly unit-testable.
 */
export function supportsLiquidGlassButtons(
  version: string | number | null | undefined,
): boolean {
  const major =
    typeof version === "number" ? version : parseInt(String(version), 10);
  return Number.isFinite(major) && major >= LIQUID_GLASS_MIN_MAJOR_VERSION;
}

function actionButtonStyle(primary: boolean | undefined) {
  const liquidGlass = supportsLiquidGlassButtons(Platform.Version);
  if (primary) return liquidGlass ? "glassProminent" : "borderedProminent";
  return liquidGlass ? "glass" : "bordered";
}

/**
 * Standard list state (C1). Loading is a bare `ProgressView`; empty/error
 * reuse `ContentUnavailableView` with the action buttons underneath (empty:
 * G4's two entry points / T6's "새 주제 만들기"; error: "다시 시도"). Primary
 * actions get the emphasized style; iOS 26+ uses Liquid Glass
 * (`glassProminent`/`glass`), older iOS falls back to
 * `borderedProminent`/`bordered`. Android resolves to
 * `standard-state-view.android.tsx`.
 */
export function StandardStateView(props: StandardStateViewProps) {
  if (props.kind === "loading") {
    return (
      <VStack testID={props.testID}>
        <ProgressView modifiers={[frame({ height: 24, width: 24 })]} />
      </VStack>
    );
  }
  const { actions, description, systemImage, testID, title } = props;
  // `ContentUnavailableView` takes all the height it is offered, which would
  // push the actions to the bottom edge; sized to its content, the view and
  // its buttons stay one group that the host centers.
  return (
    <VStack spacing={16} testID={testID}>
      <ContentUnavailableView
        description={description}
        modifiers={[fixedSize({ vertical: true })]}
        systemImage={APP_SYMBOLS[systemImage].ios}
        title={title}
      />
      {actions?.map((action) => (
        <Button
          key={action.label}
          label={action.label}
          modifiers={[buttonStyle(actionButtonStyle(action.primary))]}
          onPress={action.onPress}
        />
      ))}
    </VStack>
  );
}

/**
 * iOS-only inline error row for the top of a list that already has rows
 * (C1's "list has rows" error path). Android's counterpart is the Snackbar
 * host (`snackbar-host.android.tsx`).
 */
export function StandardStateViewErrorRow({
  message,
  onRetry,
  retryLabel = DEFAULT_RETRY_LABEL,
  testID,
}: StandardStateViewErrorRowProps) {
  return (
    <VStack testID={testID}>
      <Text>{message}</Text>
      <Button label={retryLabel} onPress={onRetry} />
    </VStack>
  );
}
