import {
  Button,
  Column,
  Icon,
  LoadingIndicator,
  OutlinedButton,
  Text,
  TextButton,
} from "@expo/ui/jetpack-compose";
import {
  fillMaxSize,
  paddingAll,
  size,
  testID as testIDModifier,
} from "@expo/ui/jetpack-compose/modifiers";
import type { ModifierConfig } from "@expo/ui/jetpack-compose/modifiers";
import type { AndroidSymbol } from "expo-symbols";
import type { ImageSourcePropType } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";

import { APP_SYMBOLS } from "./app-symbol";
import type {
  StandardStateViewErrorRowProps,
  StandardStateViewProps,
} from "./standard-state-view.types";

export type * from "./standard-state-view.types";

/**
 * Material drawables for the Android glyphs this view is actually asked to
 * render (M14 round 1: G4/T6 empty states and the shared error state). Keyed
 * by the resolved Android glyph name rather than the `AppSymbolName` alias,
 * since `emptyGroups`/`emptyTopics` intentionally reuse `group`/`chat`'s
 * glyph. An unmapped symbol falls back to the error glyph rather than
 * rendering nothing.
 */
const MATERIAL_ICON_SOURCES: Partial<
  Record<AndroidSymbol, ImageSourcePropType>
> = {
  error:
    require("../../../assets/icons/material/error.xml") as ImageSourcePropType,
  forum:
    require("../../../assets/icons/material/forum.xml") as ImageSourcePropType,
  group:
    require("../../../assets/icons/material/group.xml") as ImageSourcePropType,
};
const FALLBACK_ICON_SOURCE = MATERIAL_ICON_SOURCES.error as ImageSourcePropType;
const ICON_SIZE = 40;
const DEFAULT_RETRY_LABEL = "다시 시도";

/**
 * Centered in the space the host gives it (`fillMaxSize` is a no-op along an
 * unbounded axis, so the same view also works in a content-sized host inside
 * a scroll view).
 */
function stateModifiers(testID: string | undefined): ModifierConfig[] {
  const modifiers = [fillMaxSize(), paddingAll(24)];
  if (testID) modifiers.push(testIDModifier(testID));
  return modifiers;
}

/**
 * Standard list state (C1), Android. Loading is an M3 Expressive
 * `LoadingIndicator`; empty/error follow the M3 empty-state layout -- a
 * centered icon, `titleMedium` title, `bodyMedium` description, and the
 * action buttons underneath (primary = filled `Button`, secondary =
 * `OutlinedButton`). iOS resolves to `standard-state-view.ios.tsx`.
 */
export function StandardStateView(props: StandardStateViewProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  if (props.kind === "loading") {
    return (
      <Column
        horizontalAlignment="center"
        modifiers={stateModifiers(props.testID)}
        verticalArrangement="center"
      >
        <LoadingIndicator color={hex.primary} modifiers={[size(24, 24)]} />
      </Column>
    );
  }
  const { actions, description, systemImage, testID, title } = props;
  const androidGlyph = APP_SYMBOLS[systemImage].android;
  const iconSource =
    MATERIAL_ICON_SOURCES[androidGlyph] ?? FALLBACK_ICON_SOURCE;
  return (
    <Column
      horizontalAlignment="center"
      modifiers={stateModifiers(testID)}
      verticalArrangement="center"
    >
      <Column
        horizontalAlignment="center"
        verticalArrangement={{ spacedBy: 16 }}
      >
        <Icon size={ICON_SIZE} source={iconSource} tint={hex.textMuted} />
        <Column
          horizontalAlignment="center"
          verticalArrangement={{ spacedBy: 4 }}
        >
          <Text
            color={hex.text}
            style={{ textAlign: "center", typography: "titleMedium" }}
          >
            {title}
          </Text>
          {description ? (
            <Text
              color={hex.textMuted}
              style={{ textAlign: "center", typography: "bodyMedium" }}
            >
              {description}
            </Text>
          ) : null}
        </Column>
        {actions?.map((action) => {
          const ButtonComponent = action.primary ? Button : OutlinedButton;
          return (
            <ButtonComponent key={action.label} onClick={action.onPress}>
              <Text color={action.primary ? hex.onPrimary : hex.primary}>
                {action.label}
              </Text>
            </ButtonComponent>
          );
        })}
      </Column>
    </Column>
  );
}

/**
 * Inline error row for a section that has nothing else to show (e.g. the
 * topic gallery). Lists that already have rows report errors through the
 * Snackbar host (`snackbar-host.android.tsx`) instead.
 */
export function StandardStateViewErrorRow({
  message,
  onRetry,
  retryLabel = DEFAULT_RETRY_LABEL,
  testID,
}: StandardStateViewErrorRowProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  return (
    <Column modifiers={testID ? [testIDModifier(testID)] : undefined}>
      <Text color={hex.text}>{message}</Text>
      <TextButton onClick={onRetry}>
        <Text color={hex.primary}>{retryLabel}</Text>
      </TextButton>
    </Column>
  );
}
