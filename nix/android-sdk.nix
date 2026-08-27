{ androidPkgs }:

assert androidPkgs.stdenv.hostPlatform.system == "aarch64-darwin";

let
  versions = import ./toolchain-versions.nix;
  androidVersions = versions.android;
  androidAvd = builtins.fromJSON (builtins.readFile ./android-avd-spec.json);
  skinName = androidAvd.hardware."skin.name";
  skinSource = androidAvd.skin;
  skinFileNames = builtins.attrNames skinSource.files;

  skinEncodedFiles = builtins.mapAttrs
    (fileName: metadata: androidPkgs.fetchurl {
      name = "android-${skinName}-skin-${fileName}.base64";
      url = "${skinSource.repository}/+/${skinSource.commit}/${skinSource.path}/${fileName}?format=TEXT";
      hash = metadata.sourceHash;
    })
    skinSource.files;

  pixel9Skin = androidPkgs.runCommand
    "android-${skinName}-skin-${builtins.substring 0 12 skinSource.commit}"
    { }
    ''
      set -eu
      mkdir -p "$out"
      ${androidPkgs.lib.concatMapStringsSep "\n" (fileName: ''
        ${androidPkgs.coreutils}/bin/base64 --decode \
          "${builtins.getAttr fileName skinEncodedFiles}" \
          > "$out/${fileName}"
        printf '%s  %s\n' \
          '${(builtins.getAttr fileName skinSource.files).contentSha256}' \
          "$out/${fileName}" \
          | ${androidPkgs.coreutils}/bin/sha256sum --check --status
      '') skinFileNames}
    '';

  androidComposition = androidPkgs.androidenv.composeAndroidPackages {
    cmdLineToolsVersion = androidVersions.commandLineTools;
    platformToolsVersion = androidVersions.platformTools;
    # composeAndroidPackages selects system images from platformVersions. Keep
    # compile API 36 and the exact Pixel 9 image API 36.1 in one immutable SDK.
    platformVersions = [
      androidVersions.api
      androidVersions.emulatorApi
    ];
    # React Native pins 36.0.0 for the app while AGP 8.12 uses 35.0.0 for
    # Android library modules that do not override buildToolsVersion.
    buildToolsVersions = [
      androidVersions.buildTools
      androidVersions.agpDefaultBuildTools
    ];

    toolsVersion = null;
    includeEmulator = true;
    emulatorVersion = androidVersions.emulator;
    includeSources = false;
    includeSystemImages = true;
    systemImageTypes = [ androidAvd.systemImage.type ];
    abiVersions = [ androidAvd.systemImage.abi ];
    includeCmake = true;
    cmakeVersions = [ androidVersions.cmake ];
    includeNDK = true;
    ndkVersions = [ androidVersions.ndk ];
    useGoogleAPIs = false;
    useGoogleTVAddOns = false;
    includeExtras = [ ];
  };

  androidSdkWithPixel9Skin = androidPkgs.symlinkJoin {
    name = "androidsdk-with-${skinName}-skin";
    paths = [ androidComposition.androidsdk ];
    postBuild = ''
      mkdir -p "$out/libexec/android-sdk/skins"
      ln -s "${pixel9Skin}" "$out/libexec/android-sdk/skins/${skinName}"
    '';
  };
in
{
  package = androidSdkWithPixel9Skin;
  versions = androidVersions;
  avd = androidAvd;
}
