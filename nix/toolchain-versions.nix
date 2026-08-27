let
  androidAvd = builtins.fromJSON (builtins.readFile ./android-avd-spec.json);
in
{
  bun = "1.3.13";
  node = "22.23.2";
  java = "17.0.19";
  cocoapods = "1.16.2";
  xcodeDeveloperDir = "/Applications/Xcode.app/Contents/Developer";

  android = {
    commandLineTools = "21.0";
    platformTools = "37.0.1";
    api = "36";
    buildTools = "36.0.0";
    agpDefaultBuildTools = "35.0.0";
    cmake = "3.22.1";
    ndk = "27.1.12297006";
    emulatorApi = androidAvd.systemImage.api;
    emulator = androidAvd.emulator.packageVersion;
  };
}
