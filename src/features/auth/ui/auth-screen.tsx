import { Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { appReturnUri, providerRedirectUri } from "@/core/auth/app-return-uri";
import type { OAuthProvider } from "@/core/auth/types";
import { getPublicEnv } from "@/core/config/public-env";
import { useSession } from "@/core/providers/session-provider";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { useScreenInsets } from "@/shared/ui/app-screen";
import { AppText } from "@/shared/ui/app-text";
import {
  SystemFeedbackHost,
  useSystemFeedback,
} from "@/shared/ui/system-feedback";

import { BrandLoginButton } from "./brand-login-button";

const RETRY_LABELS = {
  restore: "세션 복원 다시 시도",
  retryProfile: "프로필 다시 시도",
  logout: "로그아웃 다시 시도",
} as const;

/**
 * The exact message the shared session controller publishes for a
 * user-initiated cancel (browser dismiss/cancel, or an OAuth
 * `access_denied` callback -- see `auth-controller.ts`'s `signIn`). L2: this
 * case returns to the original screen with no announcement at all, unlike
 * every other error, which is why it is matched by message text rather than
 * by `status` (both this case and a real failure can publish `signed-out`).
 */
const CANCELLED_LOGIN_MESSAGE = "로그인이 취소되었습니다.";

/** Keeps the brand buttons at a readable width on tablets and landscape. */
const BUTTONS_MAX_WIDTH = 440;

export function AuthScreen() {
  const env = getPublicEnv();
  const origin = env.apiOrigin;
  if (!origin) throw new Error("connected-auth requires an API origin.");
  return (
    <SystemFeedbackHost>
      <AuthScreenContent origin={origin} />
    </SystemFeedbackHost>
  );
}

/**
 * L1-L3/E12/E13: the app name at the exact centre of the screen with the
 * intro line hanging below it, over a screen-width pair of brand buttons
 * pinned above the bottom safe area.
 * `status === "loading"` (session restore) is normally hidden behind the
 * native splash (`session-provider`'s E12 coordination) -- this screen never
 * shows a "준비 중" label for it, it only keeps both buttons disabled as a
 * defensive fallback for the rare case the splash's safety timeout elapses
 * before restore settles.
 */
function AuthScreenContent({ origin }: Readonly<{ origin: string }>) {
  const { colors } = useAppTheme();
  const insets = useScreenInsets();
  const session = useSession();
  const { showNotice } = useSystemFeedback();
  const state = session.state;
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(
    null,
  );
  const busy = state.status === "signing-in";
  const disabled = busy || state.status === "loading";
  const retryAction = state.status === "error" ? state.retryAction : undefined;
  const retryOperation =
    retryAction === "restore"
      ? session.restore
      : retryAction === "logout"
        ? session.logout
        : retryAction === "retryProfile"
          ? session.retryProfile
          : undefined;

  // Announces every new error message exactly once (via the null message
  // every operation publishes before it starts -- see auth-controller.ts --
  // so a repeated identical error still re-announces). cancel/dismiss/
  // access_denied never reach `showNotice` at all (L2): they return to this
  // same screen silently.
  const lastAnnounced = useRef<string | null>(null);
  useEffect(() => {
    const message = state.message;
    if (message === lastAnnounced.current) return;
    lastAnnounced.current = message;
    if (!message || message === CANCELLED_LOGIN_MESSAGE) return;
    showNotice(
      retryAction && retryOperation
        ? {
            actionLabel: RETRY_LABELS[retryAction],
            message,
            onAction: () => void retryOperation(),
          }
        : { message },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-announce only on a genuinely new message (tracked above), not on every render of the stable showNotice/retryOperation callbacks
  }, [state.message]);

  const startLogin = (provider: OAuthProvider) => {
    setPendingProvider(provider);
    void session.login(
      provider,
      providerRedirectUri(origin, provider),
      appReturnUri(provider),
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ backgroundColor: colors.background, flex: 1 }}>
        {/* L1: the name sits at the centre of the whole screen -- centring
            it in the space above the buttons put it off-centre (device) --
            and the intro hangs below it without moving it. Drawn before the
            button column so it is still read first. */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { justifyContent: "center", paddingHorizontal: appSpacing.md },
          ]}
          testID="auth-brand"
        >
          <View>
            <AppText
              accessibilityRole="header"
              color={colors.text}
              style={{ textAlign: "center" }}
              variant="largeTitle"
            >
              잼얘좀
            </AppText>
            <AppText
              color={colors.textMuted}
              style={{
                left: 0,
                marginTop: appSpacing.xs,
                position: "absolute",
                right: 0,
                textAlign: "center",
                top: "100%",
              }}
              testID="auth-intro"
              variant="body"
            >
              카카오 또는 Google 계정으로 로그인합니다.
            </AppText>
          </View>
        </View>
        {/* A plain column, not `AppScreen`: its scroll view's automatic iOS
            inset pushed the bottom-pinned buttons into the home indicator
            (device). Two buttons never need scrolling. */}
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            paddingBottom: insets.bottom + appSpacing.md,
            paddingHorizontal: appSpacing.md,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              gap: appSpacing.sm,
              maxWidth: BUTTONS_MAX_WIDTH,
              width: "100%",
            }}
          >
            <BrandLoginButton
              busy={busy && pendingProvider === "kakao"}
              disabled={disabled}
              label="카카오로 계속하기"
              onPress={() => startLogin("kakao")}
              provider="kakao"
            />
            <BrandLoginButton
              busy={busy && pendingProvider === "google"}
              disabled={disabled}
              label="Google로 계속하기"
              onPress={() => startLogin("google")}
              provider="google"
            />
          </View>
        </View>
      </View>
    </>
  );
}
