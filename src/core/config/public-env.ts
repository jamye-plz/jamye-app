export type PublicAppMode = "local-fixture";

export type PublicEnv = Readonly<{
  appMode: PublicAppMode;
}>;

export function parsePublicAppMode(value: string | undefined): PublicAppMode {
  if (!value) {
    throw new Error(
      "EXPO_PUBLIC_APP_MODE is required. Set it to local-fixture.",
    );
  }

  if (value !== "local-fixture") {
    throw new Error(
      "EXPO_PUBLIC_APP_MODE is invalid. The only supported value is local-fixture.",
    );
  }

  return value;
}

export function getPublicEnv(): PublicEnv {
  return {
    appMode: parsePublicAppMode(process.env.EXPO_PUBLIC_APP_MODE),
  };
}
