import baseConfig from "./src/core/config/expo-base-config.json";

type AppVariant = "development" | "preview" | "production";

const DEVELOPMENT_IDENTITY = {
  name: "Jamye Development",
  slug: "jamye-app",
  iosBundleIdentifier: "dev.local.jamyeapp",
  androidPackage: "dev.local.jamyeapp",
} as const;

const DEV_CLIENT_PLUGIN = [
  "expo-dev-client",
  { addGeneratedScheme: true },
] as const;

const OAUTH_NATIVE_PLUGINS = ["expo-web-browser", "expo-secure-store"] as const;
const MEDIA_PICKER_PLUGIN = [
  "expo-image-picker",
  {
    photosPermission: "선택한 사진과 동영상을 대화에 첨부하기 위해 접근합니다.",
    cameraPermission: false,
    // E4: microphonePermission is intentionally omitted here (not `false`).
    // `false` makes this plugin strip RECORD_AUDIO / NSMicrophoneUsageDescription
    // (tools:node="remove" on Android), which conflicts with AUDIO_PLUGIN below
    // owning the microphone permission for voice messages (V3).
  },
] as const;
// V3/E4: expo-audio owns the microphone permission text for voice message
// recording. Recording-only: no background recording or playback modes
// (E8 — UIBackgroundModes "audio" must not be added).
const AUDIO_PLUGIN = [
  "expo-audio",
  {
    microphonePermission:
      "대화방에서 음성 메시지를 녹음하기 위해 마이크를 사용합니다.",
    enableBackgroundRecording: false,
    enableBackgroundPlayback: false,
  },
] as const;

// L1/L5: invite links reuse the public API origin. Apple Team ID is only
// preserved in ios/*.xcodeproj today, so `prebuild --clean` (this round)
// would otherwise drop signing; appleTeamId keeps it in the generated
// project. Associated Domains capability itself is enabled by the user in
// the Apple Developer portal (docs/development/apple-associated-domains.md).
const IOS_APPLE_TEAM_ID = "6ZH8V43A7D";
const IOS_ASSOCIATED_DOMAINS = [
  "applinks:jamye-api.ridewithmin.com",
  "applinks:jamye-api.ridewithmin.com?mode=developer",
] as const;
const ANDROID_INTENT_FILTERS = [
  {
    action: "VIEW",
    autoVerify: true,
    data: [
      {
        scheme: "https",
        host: "jamye-api.ridewithmin.com",
        pathPrefix: "/invite",
      },
    ],
    category: ["BROWSABLE", "DEFAULT"],
  },
] as const;

// Expo push: APNs entitlement on iOS, notification channel defaults on Android.
const PUSH_NOTIFICATIONS_PLUGIN = "expo-notifications" as const;

function parseAppVariant(value: string | undefined): AppVariant {
  if (!value) {
    throw new Error(
      "APP_VARIANT is required. Set APP_VARIANT=development for the configured local simulator or emulator build.",
    );
  }

  if (value === "development") return value;

  if (value === "preview") {
    throw new Error(
      "APP_VARIANT=preview is not configured. No development identity fallback is available.",
    );
  }

  if (value === "production") {
    throw new Error(
      "APP_VARIANT=production is not configured. No development identity fallback is available.",
    );
  }

  throw new Error(
    `Unsupported APP_VARIANT ${JSON.stringify(value)}. Use development; preview and production are not configured.`,
  );
}

export default function resolveExpoConfig() {
  parseAppVariant(process.env.APP_VARIANT);

  return {
    ...baseConfig,
    name: DEVELOPMENT_IDENTITY.name,
    slug: DEVELOPMENT_IDENTITY.slug,
    // EAS project owner (expo.dev account that holds the project id below).
    owner: "jamye-plz",
    scheme: "jamye",
    ios: {
      ...baseConfig.ios,
      bundleIdentifier: DEVELOPMENT_IDENTITY.iosBundleIdentifier,
      appleTeamId: IOS_APPLE_TEAM_ID,
      associatedDomains: IOS_ASSOCIATED_DOMAINS,
    },
    android: {
      ...baseConfig.android,
      package: DEVELOPMENT_IDENTITY.androidPackage,
      // Firebase Android app for Expo push (FCM V1); public identifiers only.
      googleServicesFile: "./google-services.json",
      intentFilters: ANDROID_INTENT_FILTERS,
    },
    // EAS project link. The project id is a public identifier (it ships in the
    // app manifest), not a secret; expo-notifications needs it for push tokens.
    extra: {
      ...(baseConfig as { extra?: Record<string, unknown> }).extra,
      eas: { projectId: "6a27e581-0093-4e75-bd88-01be99fcdab5" },
      // [r2] Runtime environment source for the push installation lifecycle
      // (push-lifecycle-provider.tsx): a JS manifest field, not a native
      // rebuild trigger.
      appVariant: process.env.APP_VARIANT,
    },
    plugins: [
      ...baseConfig.plugins,
      DEV_CLIENT_PLUGIN,
      ...OAUTH_NATIVE_PLUGINS,
      MEDIA_PICKER_PLUGIN,
      AUDIO_PLUGIN,
      PUSH_NOTIFICATIONS_PLUGIN,
    ],
  };
}
