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
    photosPermission: "선택한 사진과 동영상을 주제에 첨부하기 위해 접근합니다.",
    cameraPermission: false,
    microphonePermission: false,
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
    },
    android: {
      ...baseConfig.android,
      package: DEVELOPMENT_IDENTITY.androidPackage,
      // Firebase Android app for Expo push (FCM V1); public identifiers only.
      googleServicesFile: "./google-services.json",
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
      PUSH_NOTIFICATIONS_PLUGIN,
    ],
  };
}
