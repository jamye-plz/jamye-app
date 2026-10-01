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

import { AppleLoginButton } from "./apple-login-button";
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
 * The Apple flow (`signInWithApple`) never publishes a message on cancel at
 * all (it stays `null`), so it is silent by construction and needs no entry
 * here.
 */
const CANCELLED_LOGIN_MESSAGE = "로그인이 취소되었습니다.";

/** Keeps the brand buttons at a readable width on tablets and landscape. */
const BUTTONS_MAX_WIDTH = 440;

/** U3/E14: iOS names all three providers; every other platform keeps the original two. */
const IOS_INTRO_TEXT = "카카오, Google 또는 Apple 계정으로 로그인합니다.";
const DEFAULT_INTRO_TEXT = "카카오 또는 Google 계정으로 로그인합니다.";

/**
 * Exported as a pure function (not inlined at its call site) so it stays
 * unit-testable: Babel inlines `process.env.EXPO_OS` at transform time (the
 * same precedent as `src/core/theme/tokens.ts`'s identical
 * `process.env.EXPO_OS` branch), so mutating that env var at test runtime
 * has no effect on this file's already-transformed comparison. Tests call
 * this resolver directly with a literal value instead.
 */
export function authIntroText(os: string | undefined): string {
  return os === "ios" ? IOS_INTRO_TEXT : DEFAULT_INTRO_TEXT;
}

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
 * intro line hanging below it, over a screen-width column of brand buttons
 * pinned above the bottom safe area (U3: 카카오 → Google → Apple, iOS only,
 * same 48pt capsule size).
 * `status === "loading"` (session restore) is normally hidden behind the
 * native splash (`session-provider`'s E12 coordination) -- this screen never
 * shows a "준비 중" label for it, it only keeps every button disabled as a
 * defensive fallback for the rare case the splash's safety timeout elapses
 * before restore settles.
 */
function AuthScreenContent({ origin }: Readonly<{ origin: string }>) {
  const { colors } = useAppTheme();
  const insets = useScreenInsets();
  const session = useSession();
  const { showNotice } = useSystemFeedback();
  const state = session.state;
  const [pendingProvider, setPendingProvider] = useState<
    OAuthProvider | "apple" | null
  >(null);
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
  }, [retryAction, retryOperation, showNotice, state.message]);

  const startLogin = (provider: OAuthProvider) => {
    setPendingProvider(provider);
    void session.login(
      provider,
      providerRedirectUri(origin, provider),
      appReturnUri(provider),
    );
  };
  const startLoginApple = () => {
    setPendingProvider("apple");
    void session.loginWithApple();
  };

  const introText = authIntroText(process.env.EXPO_OS);

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
              {introText}
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
            <AppleLoginButton
              busy={busy && pendingProvider === "apple"}
              disabled={disabled}
              onPress={startLoginApple}
            />
          </View>
        </View>
      </View>
    </>
  );
}
