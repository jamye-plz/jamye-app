#!/usr/bin/env bash

# Non-installing native toolchain diagnostics for the jamye-app aarch64-darwin
# devShell. It inspects versions, paths, applications, processes, and devices.
# It never downloads, accepts licenses, or writes project/AVD state. Strict mode
# may start the Nix ADB server while enumerating the connected target.

set -o pipefail

PASS_COUNT=0
FAIL_COUNT=0
FAILURE_TITLES=()
FAILURE_ACTIONS=()
DIAGNOSTIC_MODE='toolchain'

require_expected_environment() {
  local variable

  for variable in \
    JAMYE_EXPECTED_BUN JAMYE_EXPECTED_NODE JAMYE_EXPECTED_JAVA \
    JAMYE_EXPECTED_COCOAPODS JAMYE_EXPECTED_CMDLINE_TOOLS \
    JAMYE_EXPECTED_PLATFORM_TOOLS JAMYE_EXPECTED_ANDROID_API \
    JAMYE_EXPECTED_BUILD_TOOLS JAMYE_EXPECTED_AGP_DEFAULT_BUILD_TOOLS \
    JAMYE_EXPECTED_ANDROID_CMAKE \
    JAMYE_EXPECTED_ANDROID_NDK \
    JAMYE_EXPECTED_DEVELOPER_DIR \
    JAMYE_EXPECTED_ANDROID_EMULATOR_API \
    JAMYE_EXPECTED_ANDROID_EMULATOR_PACKAGE \
    JAMYE_EXPECTED_ANDROID_EMULATOR_RUNTIME \
    JAMYE_EXPECTED_ANDROID_EMULATOR_BUILD_ID \
    JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_REVISION \
    JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_EXTENSION \
    JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_TYPE \
    JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_ABI \
    JAMYE_ANDROID_AVD_NAME JAMYE_ANDROID_AVD_DEVICE \
    JAMYE_ANDROID_AVD_SYSTEM_IMAGE JAMYE_ANDROID_AVD_SPEC \
    HOME JAMYE_ANDROID_STATE_HOME ANDROID_USER_HOME \
    ANDROID_EMULATOR_HOME ANDROID_AVD_HOME GRADLE_USER_HOME; do
    if [ -z "${!variable:-}" ]; then
      printf '[FAIL] Required devShell variable %s is unset or empty.\n' "$variable" >&2
      printf '       Action: Enter `nix develop path:.`, then run this diagnostic again.\n' >&2
      return 1
    fi
  done
}

parse_arguments() {
  if [ "$#" -eq 0 ]; then
    return 0
  fi
  if [ "$#" -eq 1 ] && [ "$1" = '--native-build' ]; then
    DIAGNOSTIC_MODE='native-build'
    return 0
  fi

  printf 'Usage: %s [--native-build]\n' "$0" >&2
  return 2
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf '[PASS] %s\n' "$1"
}

note() {
  printf '[INFO] %s\n' "$1"
}

fail() {
  local title="$1"
  local action="$2"

  printf '[FAIL] %s\n' "$title"
  printf '       Action: %s\n' "$action"
  FAILURE_TITLES[$FAIL_COUNT]="$title"
  FAILURE_ACTIONS[$FAIL_COUNT]="$action"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

sanitize_path() {
  local path="$1"

  if [ -n "${ANDROID_SDK_ROOT:-}" ]; then
    case "$path" in
      "$ANDROID_SDK_ROOT")
        printf '%s' '$ANDROID_SDK_ROOT'
        return
        ;;
      "$ANDROID_SDK_ROOT"/*)
        printf '%s/%s' '$ANDROID_SDK_ROOT' "${path#"$ANDROID_SDK_ROOT"/}"
        return
        ;;
    esac
  fi

  if [ -n "${HOME:-}" ]; then
    case "$path" in
      "$HOME")
        printf '%s' '~'
        return
        ;;
      "$HOME"/*)
        printf '~/%s' "${path#"$HOME"/}"
        return
        ;;
    esac
  fi

  printf '%s' "$path"
}

extract_plain_version() {
  printf '%s\n' "$1" | awk '
    /^v?[0-9]+\.[0-9]+(\.[0-9]+)?$/ {
      sub(/^v/, "")
      print
      exit
    }
  '
}

property_value() {
  local file="$1"
  local key="$2"

  awk -F= -v wanted="$key" '
    {
      property = $1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", property)
    }
    property == wanted {
      value = substr($0, index($0, "=") + 1)
      sub(/\r$/, "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      print value
      exit
    }
  ' "$file"
}

check_android_command_path() {
  local root="$1"
  local label="$2"
  local command_name="$3"
  local expected_path="$4"
  local missing_action="$5"
  local path_action="$6"
  local command_path

  if [ ! -x "$expected_path" ]; then
    fail "$label is missing at $(sanitize_path "$expected_path")" "$missing_action"
    return 1
  fi

  command_path="$(command -v "$command_name" 2>/dev/null || true)"
  if [ -z "$command_path" ]; then
    fail "$command_name is not available on PATH inside the devShell" "$path_action"
    return 1
  elif [[ "$command_path" != "$root"/* ]]; then
    fail "$command_name resolves outside ANDROID_SDK_ROOT ($(sanitize_path "$command_path"))" "$path_action"
    return 1
  else
    pass "$command_name path is $(sanitize_path "$command_path")"
    return 0
  fi
}

check_exact_version_command() {
  local label="$1"
  local command_name="$2"
  local expected="$3"
  local action="$4"
  local command_path
  local output
  local actual

  command_path="$(command -v "$command_name" 2>/dev/null || true)"
  if [ -z "$command_path" ]; then
    fail "$label command is unavailable" "$action"
    return
  fi

  case "$command_path" in
    /nix/store/*)
      ;;
    *)
      fail "$label resolves outside the Nix store ($(sanitize_path "$command_path"))" "$action"
      return
      ;;
  esac

  output="$("$command_path" --version 2>&1)"
  actual="$(extract_plain_version "$output")"
  if [ "$actual" != "$expected" ]; then
    fail "$label version is ${actual:-unrecognized}; expected $expected" "$action"
    return
  fi

  pass "$label $actual (path: $(sanitize_path "$command_path"))"
}

check_host() {
  local kernel
  local machine

  kernel="$(uname -s 2>/dev/null || true)"
  machine="$(uname -m 2>/dev/null || true)"
  if [ "$kernel" = "Darwin" ] && [ "$machine" = "arm64" ]; then
    pass 'Host system is aarch64-darwin (Darwin/arm64)'
  else
    fail "Host system is ${kernel:-unknown}/${machine:-unknown}; expected Darwin/arm64" \
      'Run this M1 environment on an Apple Silicon Mac; other systems are not supported yet.'
  fi
}

check_nix_shell() {
  if [ -n "${IN_NIX_SHELL:-}" ]; then
    pass "Running inside a Nix development shell (${IN_NIX_SHELL})"
  else
    fail 'The diagnostic is not running inside the Nix development shell' \
      'From the repository root, enter `nix develop path:.`, then run this diagnostic again.'
  fi
}

check_apple_toolchain_isolation() {
  local clang_path
  local clang_version
  local xcrun_path
  local xcode_clang_path
  local compiler_variable
  local compiler_value
  local contaminated_compiler_variables=()

  clang_path="$(command -v clang 2>/dev/null || true)"
  if [ "$clang_path" = '/usr/bin/clang' ]; then
    pass 'clang resolves to the macOS system shim (/usr/bin/clang)'
  else
    fail "clang resolves to $(sanitize_path "${clang_path:-missing}"); expected /usr/bin/clang" \
      'Exit the stale shell and re-enter `nix develop path:.`; the devShell must use mkShellNoCC and must not expose a Nix clang wrapper.'
  fi

  clang_version="$(/usr/bin/clang --version 2>&1 | head -n 1)"
  if [[ "$clang_version" == Apple\ clang\ version* ]]; then
    pass "Apple clang is active ($clang_version)"
  else
    fail 'The macOS clang shim did not report Apple clang' \
      'Complete Xcode first-run setup, select Xcode, and re-enter `nix develop path:.`.'
  fi

  xcrun_path="$(command -v xcrun 2>/dev/null || true)"
  if [ "$xcrun_path" = '/usr/bin/xcrun' ]; then
    pass 'xcrun resolves to the macOS system tool (/usr/bin/xcrun)'
  else
    fail "xcrun resolves to $(sanitize_path "${xcrun_path:-missing}"); expected /usr/bin/xcrun" \
      'Exit the stale shell and re-enter `nix develop path:.`; do not use the Nix xcbuild xcrun implementation for Expo native builds.'
  fi

  xcode_clang_path="$(/usr/bin/xcrun --find clang 2>/dev/null || true)"
  case "$xcode_clang_path" in
    "$JAMYE_EXPECTED_DEVELOPER_DIR"/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang)
      pass "xcrun selects XcodeDefault clang ($(sanitize_path "$xcode_clang_path"))"
      ;;
    *)
      fail "xcrun selects $(sanitize_path "${xcode_clang_path:-missing}") instead of the expected XcodeDefault clang" \
        'Select the intended Xcode installation, exit the stale shell, and re-enter `nix develop path:.`.'
      ;;
  esac

  for compiler_variable in NIX_CC NIX_BINTOOLS; do
    compiler_value="${!compiler_variable:-}"
    if [ -n "$compiler_value" ]; then
      contaminated_compiler_variables+=("$compiler_variable")
    fi
  done
  if [ "${#contaminated_compiler_variables[@]}" -eq 0 ]; then
    pass 'Nix compiler and binutils wrapper variables are absent'
  else
    fail "Nix compiler wrapper variable(s) remain set: ${contaminated_compiler_variables[*]}" \
      'Exit the stale shell and re-enter `nix develop path:.`; the devShell must use mkShellNoCC.'
  fi

  case "${NIX_CFLAGS_COMPILE:-}" in
    *'-isystem /nix/store/'* | *'-isystem/nix/store/'* | *'/libcxx-'* | *'/apple-sdk-'*)
      fail 'NIX_CFLAGS_COMPILE injects a Nix libc++ or Apple SDK include path' \
        'Exit the stale shell and re-enter `nix develop path:.`; do not mix Nix C++ headers with the Xcode SDK.'
      ;;
    *)
      pass 'NIX_CFLAGS_COMPILE contains no Nix libc++ or Apple SDK include injection'
      ;;
  esac

  case "${NIX_LDFLAGS:-}" in
    *'/nix/store/'*)
      fail 'NIX_LDFLAGS injects a Nix store linker path' \
        'Exit the stale shell and re-enter `nix develop path:.`; Xcode must select its own linker and libraries.'
      ;;
    *)
      pass 'NIX_LDFLAGS contains no Nix store linker injection'
      ;;
  esac

  contaminated_compiler_variables=()
  for compiler_variable in CC CXX LD AR NM RANLIB; do
    compiler_value="${!compiler_variable:-}"
    case "$compiler_value" in
      /nix/store/*)
        contaminated_compiler_variables+=("$compiler_variable")
        ;;
    esac
  done
  if [ "${#contaminated_compiler_variables[@]}" -eq 0 ]; then
    pass 'Conventional compiler and linker variables contain no Nix store executable path'
  elif [ "${#contaminated_compiler_variables[@]}" -gt 0 ]; then
    fail "Compiler or linker variable(s) resolve into the Nix store: ${contaminated_compiler_variables[*]}" \
      'Exit the stale shell and re-enter `nix develop path:.`; native Apple builds must use the Xcode toolchain.'
  fi
}

check_developer_directory() {
  local selected_developer_dir

  if [ -z "${DEVELOPER_DIR:-}" ]; then
    fail 'DEVELOPER_DIR is not set' \
      'Enter `nix develop path:.`; the devShell must export the selected Xcode developer directory.'
  elif [ "$DEVELOPER_DIR" != "$JAMYE_EXPECTED_DEVELOPER_DIR" ]; then
    fail "DEVELOPER_DIR points to $(sanitize_path "$DEVELOPER_DIR"); expected $JAMYE_EXPECTED_DEVELOPER_DIR" \
      'Exit the stale shell and re-enter `nix develop path:.`; the final shell hook must override the Nix build-only Apple SDK.'
  elif [ ! -d "$DEVELOPER_DIR" ]; then
    fail "DEVELOPER_DIR does not exist ($(sanitize_path "$DEVELOPER_DIR"))" \
      'Install or update Xcode, launch it once, and re-enter `nix develop path:.`.'
  else
    pass "DEVELOPER_DIR exists ($(sanitize_path "$DEVELOPER_DIR"))"
  fi

  if ! command -v xcode-select >/dev/null 2>&1; then
    fail 'xcode-select is unavailable' 'Install Apple command-line developer tools with Xcode.'
    return
  fi

  # xcode-select honors DEVELOPER_DIR, which would make a bad override appear
  # selected. Inspect the host selection in a subshell without that variable.
  selected_developer_dir="$(
    unset DEVELOPER_DIR
    xcode-select -p 2>/dev/null || true
  )"
  if [ -z "$selected_developer_dir" ] || [ ! -d "$selected_developer_dir" ]; then
    fail 'xcode-select has no valid active developer directory' \
      'Select the installed Xcode developer directory, then re-enter `nix develop path:.`.'
  else
    pass "xcode-select points to $(sanitize_path "$selected_developer_dir")"
    if [ -n "${DEVELOPER_DIR:-}" ] && [ "$DEVELOPER_DIR" != "$selected_developer_dir" ]; then
      fail 'DEVELOPER_DIR and xcode-select point to different developer directories' \
        'Select the intended Xcode installation and make the devShell DEVELOPER_DIR match it.'
    fi
  fi

  if [ -z "${SDKROOT:-}" ]; then
    pass 'SDKROOT is unset so Xcode can select its native platform SDK'
  else
    fail "SDKROOT is unexpectedly set ($(sanitize_path "$SDKROOT"))" \
      'Exit the stale shell and re-enter `nix develop path:.`; the final shell hook must unset the Nix build-only SDKROOT.'
  fi
}

check_xcodebuild() {
  local xcode_version
  local xcode_status

  if ! command -v xcodebuild >/dev/null 2>&1; then
    fail 'xcodebuild is unavailable' 'Install Xcode and select its developer directory.'
    return
  fi

  xcode_version="$(xcodebuild -version 2>&1 | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  xcode_status=$?
  if [ "$xcode_status" -eq 0 ] && [ -n "$xcode_version" ]; then
    pass "xcodebuild is available ($xcode_version)"
  else
    fail "xcodebuild did not report a version (exit $xcode_status)" \
      'Run `xcodebuild -version` in this devShell to see its original error, then verify Xcode first-run setup and the active developer directory.'
  fi
}

check_xcode() {
  check_developer_directory
  check_xcodebuild
}

check_ios_simulator() {
  local simctl_output
  local simctl_status
  local simulator_count

  if ! command -v xcrun >/dev/null 2>&1; then
    fail 'xcrun is unavailable, so iOS Simulator availability cannot be checked' \
      'Install Xcode and select its developer directory.'
    return
  fi

  simctl_output="$(xcrun simctl list devices available 2>&1)"
  simctl_status=$?
  if [ "$simctl_status" -ne 0 ]; then
    fail "Xcode could not list available Simulator devices (exit $simctl_status)" \
      'Run `xcrun simctl list devices available` in this devShell to see its original error, then verify Xcode first-run setup and Simulator runtimes.'
    return
  fi

  simulator_count="$(
    printf '%s\n' "$simctl_output" |
      grep -Ec '^[[:space:]]+.*\([[:xdigit:]-]{36}\)[[:space:]]+\((Booted|Shutdown)\)' || true
  )"
  if [ "${simulator_count:-0}" -gt 0 ]; then
    pass "$simulator_count available iOS Simulator device(s) detected"
  else
    fail 'No available iOS Simulator device was detected' \
      'Install an iOS Simulator runtime in Xcode Settings and create a device in Devices and Simulators.'
  fi
}

check_android_studio() {
  local studio_app='/Applications/Android Studio.app'
  local studio_executable="$studio_app/Contents/MacOS/studio"

  if [ -d "$studio_app" ] && [ -x "$studio_executable" ]; then
    pass 'Optional Android Studio inspector is installed at /Applications/Android Studio.app'
  else
    note 'Android Studio is not installed; CLI build authority is unaffected.'
  fi
}

check_android_environment() {
  if [ -z "${ANDROID_HOME:-}" ] || [ -z "${ANDROID_SDK_ROOT:-}" ]; then
    fail 'ANDROID_HOME and ANDROID_SDK_ROOT must both be set' \
      'Enter `nix develop path:.`; the devShell must export both variables to its composed Nix Android SDK.'
    return
  fi

  if [ "$ANDROID_HOME" != "$ANDROID_SDK_ROOT" ]; then
    fail "ANDROID_HOME ($(sanitize_path "$ANDROID_HOME")) and ANDROID_SDK_ROOT ($(sanitize_path "$ANDROID_SDK_ROOT")) differ" \
      'Fix the devShell so both variables identify the same composed Nix Android SDK.'
  else
    pass 'ANDROID_HOME and ANDROID_SDK_ROOT identify the same path'
  fi

  if [ ! -d "$ANDROID_SDK_ROOT" ]; then
    fail "ANDROID_SDK_ROOT does not exist ($(sanitize_path "$ANDROID_SDK_ROOT"))" \
      'Exit the stale shell and enter `nix develop path:.` again; report a flake realization failure instead of installing SDK components manually.'
    return
  fi

  case "$ANDROID_SDK_ROOT" in
    /nix/store/*/libexec/android-sdk)
      pass 'ANDROID_SDK_ROOT is the composed Nix Android SDK'
      ;;
    *)
      fail "ANDROID_SDK_ROOT is not a composed Nix store SDK ($(sanitize_path "$ANDROID_SDK_ROOT"))" \
        'Re-enter the project devShell; do not substitute an Android Studio-managed SDK for CLI builds.'
      ;;
  esac
}

check_sdkmanager() {
  local root="$1"
  local expected_path="$root/cmdline-tools/$JAMYE_EXPECTED_CMDLINE_TOOLS/bin/sdkmanager"
  local revision
  local output
  local actual

  if ! check_android_command_path \
    "$root" "Android command-line tools $JAMYE_EXPECTED_CMDLINE_TOOLS executable" \
    sdkmanager "$expected_path" \
    'Report the flake mismatch; add or change SDK components only through the approved Nix composition.' \
    'Exit and re-enter `nix develop path:.`; ensure external Android SDK tools do not precede the Nix SDK on PATH.'; then
    return
  fi

  revision="$(property_value "$root/cmdline-tools/$JAMYE_EXPECTED_CMDLINE_TOOLS/source.properties" 'Pkg.Revision' 2>/dev/null || true)"
  output="$("$expected_path" --version 2>&1)"
  actual="$(extract_plain_version "$output")"
  if [ "$revision" = "$JAMYE_EXPECTED_CMDLINE_TOOLS" ] && [ "$actual" = "$JAMYE_EXPECTED_CMDLINE_TOOLS" ]; then
    pass "Android command-line tools revision is $actual"
  else
    fail "Android command-line tools revision is property=${revision:-missing}, command=${actual:-unrecognized}; expected $JAMYE_EXPECTED_CMDLINE_TOOLS" \
      'Report the pinned SDK mismatch; do not update it with sdkmanager.'
  fi
}

check_adb() {
  local root="$1"
  local expected_path="$root/platform-tools/adb"
  local revision
  local output
  local actual

  if ! check_android_command_path \
    "$root" adb adb "$expected_path" \
    'Report the flake mismatch; platform-tools must come from the approved Nix composition.' \
    'Exit and re-enter `nix develop path:.`; ensure external platform-tools do not precede the Nix SDK on PATH.'; then
    return
  fi

  revision="$(property_value "$root/platform-tools/source.properties" 'Pkg.Revision' 2>/dev/null || true)"
  output="$("$expected_path" version 2>&1)"
  actual="$(printf '%s\n' "$output" | sed -n 's/^Version \([0-9][0-9.]*\).*/\1/p' | head -n 1)"
  if [ "$revision" = "$JAMYE_EXPECTED_PLATFORM_TOOLS" ] && [ "$actual" = "$JAMYE_EXPECTED_PLATFORM_TOOLS" ]; then
    pass "Android platform-tools revision is $actual"
  else
    fail "Android platform-tools revision is property=${revision:-missing}, command=${actual:-unrecognized}; expected $JAMYE_EXPECTED_PLATFORM_TOOLS" \
      'Report the pinned SDK mismatch; do not update it with sdkmanager.'
  fi
}

check_android_platform() {
  local root="$1"
  local platform_dir="$root/platforms/android-$JAMYE_EXPECTED_ANDROID_API"
  local api_level

  api_level="$(property_value "$platform_dir/source.properties" 'AndroidVersion.ApiLevel' 2>/dev/null || true)"
  if [ -f "$platform_dir/android.jar" ] && [ "$api_level" = "$JAMYE_EXPECTED_ANDROID_API" ]; then
    pass "Android Platform API $api_level (path: \$ANDROID_SDK_ROOT/platforms/android-$JAMYE_EXPECTED_ANDROID_API)"
  else
    fail "Android Platform API $JAMYE_EXPECTED_ANDROID_API is missing or invalid (reported API: ${api_level:-missing})" \
      'Report the flake mismatch; the platform must be supplied by the approved Nix composition.'
  fi
}

check_android_build_tools_revision() {
  local root="$1"
  local expected="$2"
  local role="$3"
  local build_tools_dir="$root/build-tools/$expected"
  local revision

  revision="$(property_value "$build_tools_dir/source.properties" 'Pkg.Revision' 2>/dev/null || true)"
  if [ -x "$build_tools_dir/aapt2" ] && [ "$revision" = "$expected" ]; then
    pass "Android Build Tools $revision ($role; path: \$ANDROID_SDK_ROOT/build-tools/$expected)"
  else
    fail "Android Build Tools revision is ${revision:-missing}; expected $expected for $role with aapt2" \
      'Report the flake mismatch; every Gradle-selected build-tools revision must be supplied by the approved Nix composition.'
  fi
}

check_android_build_tools() {
  local root="$1"

  check_android_build_tools_revision "$root" "$JAMYE_EXPECTED_BUILD_TOOLS" 'project default'
  check_android_build_tools_revision "$root" "$JAMYE_EXPECTED_AGP_DEFAULT_BUILD_TOOLS" 'AGP 8.12 default'
}

check_android_cmake() {
  local root="$1"
  local cmake_dir="$root/cmake/$JAMYE_EXPECTED_ANDROID_CMAKE"
  local revision

  revision="$(property_value "$cmake_dir/source.properties" 'Pkg.Revision' 2>/dev/null || true)"
  if [ -x "$cmake_dir/bin/cmake" ] && [ "$revision" = "$JAMYE_EXPECTED_ANDROID_CMAKE" ]; then
    pass "Android CMake $revision is supplied by the Nix SDK"
  else
    fail "Android CMake revision is ${revision:-missing}; expected $JAMYE_EXPECTED_ANDROID_CMAKE" \
      'Report the flake mismatch; CMake must be supplied by the approved Nix composition instead of Gradle or sdkmanager.'
  fi
}

check_android_ndk() {
  local root="$1"
  local ndk_dir="$root/ndk/$JAMYE_EXPECTED_ANDROID_NDK"
  local revision

  revision="$(property_value "$ndk_dir/source.properties" 'Pkg.Revision' 2>/dev/null || true)"
  if [ -f "$ndk_dir/build/cmake/android.toolchain.cmake" ] && \
    [ "$revision" = "$JAMYE_EXPECTED_ANDROID_NDK" ]; then
    pass "Android NDK $revision is supplied by the Nix SDK"
  else
    fail "Android NDK revision is ${revision:-missing}; expected $JAMYE_EXPECTED_ANDROID_NDK" \
      'Report the flake mismatch; the NDK must be supplied by the approved Nix composition instead of Gradle or sdkmanager.'
  fi

  if [ -z "${ANDROID_NDK_HOME:-}" ] && [ -z "${ANDROID_NDK_ROOT:-}" ]; then
    pass 'Android NDK resolution has no host SDK environment override'
  else
    fail 'ANDROID_NDK_HOME or ANDROID_NDK_ROOT overrides the side-by-side Nix SDK contract' \
      'Exit and re-enter `nix develop path:.`; do not point Gradle at an Android Studio-managed or writable NDK.'
  fi
}

check_android_emulator() {
  local root="$1"
  local emulator_path="$root/emulator/emulator"
  local output
  local runtime_version
  local build_id
  local image_root
  local properties
  local revision
  local api_level
  local extension_level
  local abi
  local tag

  if ! check_android_command_path \
    "$root" "Android Emulator $JAMYE_EXPECTED_ANDROID_EMULATOR_PACKAGE executable" \
    emulator "$emulator_path" \
    'Report the flake mismatch; the Emulator must come from the approved Nix composition.' \
    'Exit and re-enter `nix develop path:.`; ensure the user SDK Emulator does not precede the Nix SDK on PATH.'; then
    return
  fi

  output="$("$emulator_path" -version 2>&1)"
  runtime_version="$(printf '%s\n' "$output" | sed -n 's/^Android emulator version \([^ ]*\).*/\1/p' | head -n 1)"
  build_id="$(printf '%s\n' "$output" | sed -n 's/.*(build_id \([^)]*\)).*/\1/p' | head -n 1)"
  if [ "$runtime_version" = "$JAMYE_EXPECTED_ANDROID_EMULATOR_RUNTIME" ] && \
    [ "$build_id" = "$JAMYE_EXPECTED_ANDROID_EMULATOR_BUILD_ID" ]; then
    pass "Android Emulator $runtime_version (build $build_id) is Nix-managed"
  else
    fail "Android Emulator is runtime=${runtime_version:-missing}, build=${build_id:-missing}; expected $JAMYE_EXPECTED_ANDROID_EMULATOR_RUNTIME/$JAMYE_EXPECTED_ANDROID_EMULATOR_BUILD_ID" \
      'Report the flake mismatch; do not substitute or update the user SDK Emulator.'
  fi

  image_root="$root/system-images/android-$JAMYE_EXPECTED_ANDROID_EMULATOR_API/$JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_TYPE/$JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_ABI"
  properties="$image_root/source.properties"
  revision="$(property_value "$properties" 'Pkg.Revision' 2>/dev/null || true)"
  api_level="$(property_value "$properties" 'AndroidVersion.ApiLevel' 2>/dev/null || true)"
  extension_level="$(property_value "$properties" 'AndroidVersion.ExtensionLevel' 2>/dev/null || true)"
  abi="$(property_value "$properties" 'SystemImage.Abi' 2>/dev/null || true)"
  tag="$(property_value "$properties" 'SystemImage.TagId' 2>/dev/null || true)"
  if [ "$revision" = "$JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_REVISION" ] && \
    [ "$api_level" = "$JAMYE_EXPECTED_ANDROID_EMULATOR_API" ] && \
    [ "$extension_level" = "$JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_EXTENSION" ] && \
    [ "$abi" = "$JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_ABI" ] && \
    [ "$tag" = "$JAMYE_EXPECTED_ANDROID_SYSTEM_IMAGE_TYPE" ]; then
    pass "Android $api_level Google Play ARM64 system image revision $revision is Nix-managed"
  else
    fail "Android Emulator system image metadata differs at $(sanitize_path "$image_root")" \
      'Report the flake mismatch; do not install or update the image with Android Studio or sdkmanager.'
  fi

  if [ -d "$root/skins/$JAMYE_ANDROID_AVD_DEVICE" ]; then
    pass "Android $JAMYE_ANDROID_AVD_DEVICE skin is supplied by the Nix SDK"
  else
    fail "Android $JAMYE_ANDROID_AVD_DEVICE skin is absent from the Nix SDK" \
      'Report the flake mismatch; exact Pixel 9 parity requires the Nix-owned skin.'
  fi
}

check_android_state_isolation() {
  local expected_state_home
  local expected_cache_home
  local variable
  local value

  expected_state_home="${XDG_STATE_HOME:-$HOME/.local/state}/jamye-app/android"
  expected_cache_home="${XDG_CACHE_HOME:-$HOME/.cache}/jamye-app/gradle"
  for variable in JAMYE_ANDROID_STATE_HOME ANDROID_USER_HOME ANDROID_EMULATOR_HOME ANDROID_AVD_HOME GRADLE_USER_HOME; do
    value="${!variable}"
    if [ -e "$value" ] && [ -L "$value" ]; then
      fail "$variable is a symlink ($(sanitize_path "$value"))" \
        'Remove the indirection only through an approved state-recovery gate, then re-enter the devShell.'
    fi
  done

  if [ "$JAMYE_ANDROID_STATE_HOME" = "$expected_state_home" ] && \
    [ "$ANDROID_USER_HOME" = "$expected_state_home/user" ] && \
    [ "$ANDROID_EMULATOR_HOME" = "$expected_state_home/emulator" ] && \
    [ "$ANDROID_AVD_HOME" = "$expected_state_home/avd" ] && \
    [ "$GRADLE_USER_HOME" = "$expected_cache_home" ]; then
    pass 'Android AVD and Gradle state use the project-specific XDG roots'
  else
    fail 'Android AVD or Gradle state escaped the project-specific XDG roots' \
      'Exit the stale shell and re-enter `nix develop path:.`; do not override the project state variables.'
  fi

  case "$JAMYE_ANDROID_STATE_HOME" in
    "$PWD" | "$PWD"/* | /nix/store/*)
      fail "Mutable Android state has an unsafe root ($(sanitize_path "$JAMYE_ANDROID_STATE_HOME"))" \
        'Keep mutable state outside the repository and the immutable Nix store.'
      ;;
    *)
      pass 'Mutable Android state is outside the repository and Nix store'
      ;;
  esac
}

check_java() {
  local command_path
  local output
  local actual

  command_path="$(command -v java 2>/dev/null || true)"
  if [ -z "$command_path" ]; then
    fail 'Java is unavailable' 'Enter `nix develop path:.`; Java must come from the pinned Zulu JDK 17 package.'
    return
  fi

  output="$("$command_path" -version 2>&1)"
  actual="$(printf '%s\n' "$output" | sed -n 's/.*version "\([^"]*\)".*/\1/p' | head -n 1)"
  if [ "$actual" = "$JAMYE_EXPECTED_JAVA" ]; then
    pass "Java $actual (path: $(sanitize_path "$command_path"))"
  else
    fail "Java version is ${actual:-unrecognized}; expected $JAMYE_EXPECTED_JAVA" \
      'Exit and re-enter `nix develop path:.`; do not use the global JDK for this project.'
  fi

  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    pass "JAVA_HOME contains a Java executable ($(sanitize_path "$JAVA_HOME"))"
    if [[ "$command_path" != "$JAVA_HOME"/* ]]; then
      fail "Java resolves outside JAVA_HOME ($(sanitize_path "$command_path"))" \
        'Exit and re-enter `nix develop path:.`; the active Java command must come from the pinned JAVA_HOME.'
    fi
  else
    fail 'JAVA_HOME is unset or does not contain bin/java' \
      'Enter `nix develop path:.`; the devShell must export JAVA_HOME from the pinned Zulu JDK.'
  fi
}

check_adb_server_isolation() {
  local expected_adb
  local pid
  local executable
  local server_found=0

  expected_adb="$(/bin/realpath "$ANDROID_SDK_ROOT/platform-tools/adb" 2>/dev/null || true)"
  while read -r pid; do
    [ -n "$pid" ] || continue
    server_found=1
    executable="$(/usr/sbin/lsof -a -p "$pid" -d txt -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
    if [ "$executable" != "$expected_adb" ]; then
      fail "ADB server process $pid comes from $(sanitize_path "${executable:-unknown}")" \
        'Stop only that foreign ADB server through an approved recovery card; the next devShell ADB command must start the Nix-owned server.'
      return 1
    fi
  done < <(pgrep -f 'adb .*fork-server server' 2>/dev/null || true)

  if [ "$server_found" -eq 1 ]; then
    pass 'The active ADB server executable is supplied by the Nix SDK'
  else
    pass 'No pre-existing ADB server can retain a foreign SDK environment'
  fi
  return 0
}

check_android_target_ready() {
  local adb="$ANDROID_SDK_ROOT/platform-tools/adb"
  local serial
  local state
  local avd_name
  local boot_completed

  while read -r serial state; do
    if [[ "$serial" != emulator-* ]] || [ "$state" != 'device' ]; then
      continue
    fi
    avd_name="$("$adb" -s "$serial" emu avd name 2>/dev/null | head -n 1 | tr -d '\r')"
    if [ "$avd_name" != "$JAMYE_ANDROID_AVD_NAME" ]; then
      continue
    fi

    boot_completed="$("$adb" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    if [ "$boot_completed" = '1' ]; then
      pass "Nix-owned Android target $JAMYE_ANDROID_AVD_NAME is booted on $serial"
    else
      fail "Android target $JAMYE_ANDROID_AVD_NAME is not fully booted on $serial" \
        'Wait for the separately approved project-AVD start card to report a usable device, then rerun the strict preflight.'
    fi
    return
  done < <("$adb" devices 2>/dev/null | awk 'NR > 1 && NF >= 2 { print $1, $2 }')

  fail "No connected Emulator exposes the exact project AVD $JAMYE_ANDROID_AVD_NAME" \
    'Run the separately approved `bun tools/android/nix-avd.cjs start` card and wait for Android to boot.'
}

check_native_build_isolation() {
  local verification_output

  if pgrep -f '/Applications/Android Studio.app/Contents/MacOS/studio' >/dev/null 2>&1; then
    fail 'Android Studio is running during the strict native-build preflight' \
      'Quit Android Studio before a CLI native build so it cannot start a foreign Gradle daemon or rewrite generated overrides.'
  else
    pass 'Android Studio is closed for the strict native-build preflight'
  fi

  if pgrep -f 'org.gradle.launcher.daemon.bootstrap.GradleDaemon' >/dev/null 2>&1; then
    fail 'A Gradle daemon is already running before the strict native-build preflight' \
      'Identify and stop only the relevant daemon through an approved recovery card, then re-enter the devShell.'
  else
    pass 'No pre-existing Gradle daemon can retain a foreign IDE environment'
  fi

  if [ -e android/local.properties ] || [ -e android/gradle/gradle-daemon-jvm.properties ]; then
    fail 'Android Studio generated a local SDK or Gradle JVM override in the CNG output' \
      'Close Android Studio and remove only the validated ignored override files through an approved recovery gate.'
  else
    pass 'Generated Android output contains no local SDK or Gradle JVM override'
  fi

  verification_output="$(bun tools/android/nix-avd.cjs verify 2>&1)"
  if [ $? -eq 0 ]; then
    pass "Project AVD $JAMYE_ANDROID_AVD_NAME matches the Nix-owned specification"
  else
    fail "Project AVD verification failed: $(printf '%s\n' "$verification_output" | tail -n 1)" \
      'Follow the exact reason: quit a foreign Emulator or run the separately approved project-AVD create/recovery card; do not delete state automatically.'
  fi

  if check_adb_server_isolation; then
    check_android_target_ready
  fi
}

print_summary() {
  local index

  printf '\nSummary: %d passed, %d failed.\n' "$PASS_COUNT" "$FAIL_COUNT"
  if [ "$FAIL_COUNT" -eq 0 ]; then
    printf 'Native toolchain diagnostics passed.\n'
    return 0
  fi

  printf 'Required actions before native toolchain verification can pass:\n'
  index=0
  while [ "$index" -lt "$FAIL_COUNT" ]; do
    printf '  %d. %s\n' "$((index + 1))" "${FAILURE_TITLES[$index]}"
    printf '     %s\n' "${FAILURE_ACTIONS[$index]}"
    index=$((index + 1))
  done
  return 1
}

main() {
  parse_arguments "$@" || return $?
  require_expected_environment || return 1

  printf 'jamye-app native toolchain diagnostics (non-installing, mode=%s)\n' "$DIAGNOSTIC_MODE"
  printf 'Expected host: aarch64-darwin\n\n'

  check_host
  check_nix_shell
  check_xcode
  check_apple_toolchain_isolation
  check_ios_simulator
  check_android_studio

  check_exact_version_command 'Bun' bun "$JAMYE_EXPECTED_BUN" \
    'Exit and re-enter `nix develop path:.`; report the pinned Bun mismatch instead of installing another version.'
  check_exact_version_command 'Node.js' node "$JAMYE_EXPECTED_NODE" \
    'Exit and re-enter `nix develop path:.`; report the pinned Node.js mismatch instead of using the global runtime.'
  check_java
  check_exact_version_command 'CocoaPods' pod "$JAMYE_EXPECTED_COCOAPODS" \
    'Exit and re-enter `nix develop path:.`; report the pinned CocoaPods mismatch instead of installing a gem globally.'

  check_android_environment
  if [ -n "${ANDROID_SDK_ROOT:-}" ] && [ -d "$ANDROID_SDK_ROOT" ]; then
    check_sdkmanager "$ANDROID_SDK_ROOT"
    check_adb "$ANDROID_SDK_ROOT"
    check_android_platform "$ANDROID_SDK_ROOT"
    check_android_build_tools "$ANDROID_SDK_ROOT"
    check_android_cmake "$ANDROID_SDK_ROOT"
    check_android_ndk "$ANDROID_SDK_ROOT"
    check_android_emulator "$ANDROID_SDK_ROOT"
  else
    fail 'Nix Android SDK component versions could not be checked' \
      'Fix ANDROID_SDK_ROOT through the devShell, then rerun this diagnostic.'
  fi

  check_android_state_isolation
  if [ "$DIAGNOSTIC_MODE" = 'native-build' ]; then
    check_native_build_isolation
  fi
  print_summary
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
