import { ActivityIndicator, Text, View } from "react-native";

import type {
  StandardStateViewErrorRowProps,
  StandardStateViewProps,
} from "./standard-state-view.types";

export type * from "./standard-state-view.types";

const DEFAULT_RETRY_LABEL = "다시 시도";

/**
 * Fallback for platforms without a native content-unavailable affordance
 * (web). iOS and Android resolve to their own files (`ContentUnavailableView`
 * / an icon-and-text Compose layout).
 */
export function StandardStateView(props: StandardStateViewProps) {
  if (props.kind === "loading") {
    return (
      <View testID={props.testID}>
        <ActivityIndicator />
      </View>
    );
  }
  const { actions, description, testID, title } = props;
  return (
    <View testID={testID}>
      <Text accessibilityRole="header">{title}</Text>
      {description ? <Text>{description}</Text> : null}
      {actions?.map((action) => (
        <Text
          accessibilityRole="button"
          key={action.label}
          onPress={action.onPress}
        >
          {action.label}
        </Text>
      ))}
    </View>
  );
}

/** Fallback for the inline top-of-list error row; see `standard-state-view.ios.tsx`. */
export function StandardStateViewErrorRow({
  message,
  onRetry,
  retryLabel = DEFAULT_RETRY_LABEL,
  testID,
}: StandardStateViewErrorRowProps) {
  return (
    <View testID={testID}>
      <Text>{message}</Text>
      <Text accessibilityRole="button" onPress={onRetry}>
        {retryLabel}
      </Text>
    </View>
  );
}
