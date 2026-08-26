import baseConfig from "./src/core/config/expo-base-config.json";

type AppVariant = "development" | "preview" | "production";

const DEVELOPMENT_IDENTITY = {
  name: "Jamye Development",
  slug: "jamye-development",
  iosBundleIdentifier: "dev.local.jamyeapp",
  androidPackage: "dev.local.jamyeapp",
} as const;

const DEV_CLIENT_PLUGIN = [
  "expo-dev-client",
  { addGeneratedScheme: true },
] as const;

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
    ios: {
      ...baseConfig.ios,
      bundleIdentifier: DEVELOPMENT_IDENTITY.iosBundleIdentifier,
    },
    android: {
      ...baseConfig.android,
      package: DEVELOPMENT_IDENTITY.androidPackage,
    },
    plugins: [...baseConfig.plugins, DEV_CLIENT_PLUGIN],
  };
}
