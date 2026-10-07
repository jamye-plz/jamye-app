import { Stack, ThemeProvider } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppErrorBoundary } from "@/core/errors/app-error-boundary";
import { AppProviders } from "@/core/providers/app-providers";
import {
  useNativeStackScreenOptions,
  useNavigationTheme,
} from "@/shared/ui/native-stack-screen-options";

/**
 * Themed root Stack. `AppThemeProvider` lives inside `AppProviders`, so this
 * inner component reads the theme at render time instead of hoisting the
 * `Stack` into `RootLayout` directly. The `(tabs)` group owns the top-level
 * tab bar (ADR 0009); chat and the create/join/new-topic modals stay here so
 * the tab bar is hidden while they are open.
 */
function RootStack() {
  const screenOptions = useNativeStackScreenOptions();
  const navigationTheme = useNavigationTheme();
  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={screenOptions}>
        {/* The entry route only renders the login screen (which hides the
            header itself) or a redirect; while that redirect is pending, or
            restore outlasts the splash, it showed a header titled "index". */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        {/* E7a/C13: registered here for the same reason as the C3 screens
            below -- a signed-out guard's `<Redirect href="/sign-in" />`
            resolves through the router the same way an external link would,
            and `AuthScreen` already self-sets `headerShown: false` via its
            own `Stack.Screen`, but an explicit entry keeps the route
            discoverable in this one manifest alongside every other route
            this file already lists. */}
        <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
        {/* F-7: the root-stack back label for any screen pushed over the
            tabs (e.g. chat). A static Korean phrase is used because a chat
            can be pushed from any tab, so no single tab's title is always
            correct here; without it, VoiceOver reads this screen's route
            name "(tabs)" as the back label instead. Still headerShown:
            false, so this title is never shown anywhere visually. */}
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false, title: "이전 화면" }}
        />
        {/* C3 input screens. Declared here, not only from inside the
            screens: options a screen sets on itself never reach a route
            opened by a link (an invite link lands on groups/join), which
            then showed as a full screen titled with its path. */}
        <Stack.Screen
          name="groups/create"
          options={{ presentation: "modal", title: "새 그룹" }}
        />
        <Stack.Screen
          name="groups/join"
          options={{ presentation: "modal", title: "초대 코드로 가입" }}
        />
        <Stack.Screen
          name="groups/[groupId]/topics/new"
          options={{ presentation: "modal", title: "새 주제" }}
        />
        <Stack.Screen
          name="groups/[groupId]/rename"
          options={{ presentation: "modal", title: "그룹 이름 변경" }}
        />
        <Stack.Screen
          name="account/nickname"
          options={{ presentation: "modal", title: "닉네임 변경" }}
        />
        {/* R3 full-screen attachment viewer -- declared here (not only in
            media-viewer.tsx) for the same reason as the C3 screens above:
            self-set options never reach a route opened other than through
            its own screen render. */}
        <Stack.Screen
          name="media-viewer"
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
      </Stack>
    </ThemeProvider>
  );
}

/** Gesture root for swipeable rows (topic list) and future gesture-driven UI. */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <AppErrorBoundary>
        <AppProviders>
          <RootStack />
        </AppProviders>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = { root: { flex: 1 } } as const;
