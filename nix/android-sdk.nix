{ androidPkgs }:

assert androidPkgs.stdenv.hostPlatform.system == "aarch64-darwin";

let
  versions = import ./toolchain-versions.nix;
  androidVersions = versions.android;

  androidComposition = androidPkgs.androidenv.composeAndroidPackages {
    cmdLineToolsVersion = androidVersions.commandLineTools;
    platformToolsVersion = androidVersions.platformTools;
    platformVersions = [ androidVersions.api ];
    buildToolsVersions = [ androidVersions.buildTools ];

    # M1 provides only the CLI pieces required by an Expo/RN native build.
    toolsVersion = null;
    includeEmulator = false;
    includeSources = false;
    includeSystemImages = false;
    includeCmake = false;
    includeNDK = false;
    useGoogleAPIs = false;
    useGoogleTVAddOns = false;
    includeExtras = [ ];
  };
in
{
  package = androidComposition.androidsdk;
  versions = androidVersions;
}
