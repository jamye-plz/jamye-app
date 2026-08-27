{
  pkgs,
  androidSdk,
}:

assert pkgs.stdenv.hostPlatform.system == "aarch64-darwin";
let
  versions = import ./toolchain-versions.nix;
  androidVersions = androidSdk.versions;
  androidAvd = androidSdk.avd;
  androidSdkPackage = androidSdk.package;
  androidSdkRoot = "${androidSdkPackage}/libexec/android-sdk";
in
assert pkgs.bun.version == versions.bun;
assert pkgs.nodejs_22.version == versions.node;
assert pkgs.zulu17.version == versions.java;
assert pkgs.cocoapods.version == versions.cocoapods;
# Native Apple builds must use Xcode's clang, libc++, SDK, and linker. Keep the
# pinned Nix runtimes below without importing the Darwin stdenv compiler wrapper.
pkgs.mkShellNoCC {
  packages = [
    pkgs.bun
    pkgs.nodejs_22
    pkgs.zulu17
    pkgs.cocoapods
    androidSdkPackage
  ];

  JAVA_HOME = "${pkgs.zulu17.home}";
  ANDROID_HOME = androidSdkRoot;
  ANDROID_SDK_ROOT = androidSdkRoot;
  JAMYE_ANDROID_AVD_SPEC = ./android-avd-spec.json;
  JAMYE_EXPECTED_BUN = versions.bun;
  JAMYE_EXPECTED_NODE = versions.node;
  JAMYE_EXPECTED_JAVA = versions.java;
  JAMYE_EXPECTED_COCOAPODS = versions.cocoapods;
  JAMYE_EXPECTED_CMDLINE_TOOLS = androidVersions.commandLineTools;
  JAMYE_EXPECTED_PLATFORM_TOOLS = androidVersions.platformTools;
  JAMYE_EXPECTED_ANDROID_API = androidVersions.api;
  JAMYE_EXPECTED_BUILD_TOOLS = androidVersions.buildTools;
  JAMYE_EXPECTED_AGP_DEFAULT_BUILD_TOOLS = androidVersions.agpDefaultBuildTools;
  JAMYE_EXPECTED_ANDROID_CMAKE = androidVersions.cmake;
  JAMYE_EXPECTED_ANDROID_NDK = androidVersions.ndk;
  JAMYE_EXPECTED_ANDROID_EMULATOR_API = androidVersions.emulatorApi;
  JAMYE_EXPECTED_ANDROID_EMULATOR_PACKAGE = androidVersions.emulator;
  JAMYE_EXPECTED_ANDROID_EMULATOR_RUNTIME = androidAvd.emulator.runtimeVersion;
  JAMYE_EXPECTED_ANDROID_EMULATOR_BUILD_ID = androidAvd.emulator.buildId;
  JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_REVISION = androidAvd.systemImage.revision;
  JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_EXTENSION = androidAvd.systemImage.extensionLevel;
  JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_TYPE = androidAvd.systemImage.type;
  JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_ABI = androidAvd.systemImage.abi;
  JAMYE_ANDROID_AVD_NAME = androidAvd.name;
  JAMYE_ANDROID_AVD_DEVICE = androidAvd.device;
  JAMYE_ANDROID_AVD_SYSTEM_IMAGE = "system-images;android-${androidAvd.systemImage.api};${androidAvd.systemImage.type};${androidAvd.systemImage.abi}";
  JAMYE_EXPECTED_DEVELOPER_DIR = versions.xcodeDeveloperDir;

  # composeAndroidPackages keeps Android executables below libexec instead of
  # exposing them through the derivation's top-level bin directory.
  shellHook = ''
    # Nix's Darwin stdenv setup hook points DEVELOPER_DIR and SDKROOT at its
    # build-only macOS SDK. Expo native iOS commands need the user-installed
    # Xcode selected by this project, so apply this override after setup hooks.
    export DEVELOPER_DIR="$JAMYE_EXPECTED_DEVELOPER_DIR"
    unset SDKROOT

    # Tool binaries and immutable images come from Nix. Mutable AVD and Gradle
    # state stay outside both the repository and the read-only Nix store.
    export JAMYE_ANDROID_STATE_HOME="''${XDG_STATE_HOME:-$HOME/.local/state}/jamye-app/android"
    export ANDROID_USER_HOME="$JAMYE_ANDROID_STATE_HOME/user"
    export ANDROID_EMULATOR_HOME="$JAMYE_ANDROID_STATE_HOME/emulator"
    export ANDROID_AVD_HOME="$JAMYE_ANDROID_STATE_HOME/avd"
    export GRADLE_USER_HOME="''${XDG_CACHE_HOME:-$HOME/.cache}/jamye-app/gradle"

    # Gradle resolves the pinned side-by-side NDK from ANDROID_SDK_ROOT. Remove
    # host overrides so a user or Android Studio SDK cannot become build input.
    unset ANDROID_NDK_HOME ANDROID_NDK_ROOT

    export PATH="$ANDROID_HOME/cmdline-tools/$JAMYE_EXPECTED_CMDLINE_TOOLS/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
  '';
}
