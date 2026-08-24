#!/usr/bin/env bash

# Read-only M1 toolchain diagnostics for the jamye-app aarch64-darwin devShell.
# This script only inspects versions, paths, installed applications, and device
# lists. It never installs, downloads, accepts licenses, or changes settings.

set -o pipefail

PASS_COUNT=0
FAIL_COUNT=0
FAILURE_TITLES=()
FAILURE_ACTIONS=()

require_expected_environment() {
  local variable

  for variable in \
    JAMYE_EXPECTED_BUN JAMYE_EXPECTED_NODE JAMYE_EXPECTED_JAVA \
    JAMYE_EXPECTED_COCOAPODS JAMYE_EXPECTED_CMDLINE_TOOLS \
    JAMYE_EXPECTED_PLATFORM_TOOLS JAMYE_EXPECTED_ANDROID_API \
    JAMYE_EXPECTED_BUILD_TOOLS JAMYE_EXPECTED_DEVELOPER_DIR; do
    if [ -z "${!variable:-}" ]; then
      printf '[FAIL] Required devShell variable %s is unset or empty.\n' "$variable" >&2
      printf '       Action: Enter `nix develop path:.`, then run this diagnostic again.\n' >&2
      return 1
    fi
  done
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf '[PASS] %s\n' "$1"
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
    $1 == wanted {
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
  elif [[ "$command_path" != "$root"/* ]]; then
    fail "$command_name resolves outside ANDROID_SDK_ROOT ($(sanitize_path "$command_path"))" "$path_action"
  else
    pass "$command_name path is $(sanitize_path "$command_path")"
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
    pass 'Android Studio is installed at /Applications/Android Studio.app'
  else
    fail 'Android Studio is not installed at /Applications/Android Studio.app' \
      'Install the stable Android Studio application in /Applications and launch its setup wizard.'
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

check_android_build_tools() {
  local root="$1"
  local build_tools_dir="$root/build-tools/$JAMYE_EXPECTED_BUILD_TOOLS"
  local revision

  revision="$(property_value "$build_tools_dir/source.properties" 'Pkg.Revision' 2>/dev/null || true)"
  if [ -x "$build_tools_dir/aapt2" ] && [ "$revision" = "$JAMYE_EXPECTED_BUILD_TOOLS" ]; then
    pass "Android Build Tools $revision (path: \$ANDROID_SDK_ROOT/build-tools/$JAMYE_EXPECTED_BUILD_TOOLS)"
  else
    fail "Android Build Tools revision is ${revision:-missing}; expected $JAMYE_EXPECTED_BUILD_TOOLS with aapt2" \
      'Report the flake mismatch; build tools must be supplied by the approved Nix composition.'
  fi
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

check_android_studio_avd() {
  local studio_sdk_root
  local emulator_path
  local avd_output
  local avd_count

  if [ -z "${HOME:-}" ]; then
    fail 'HOME is unavailable, so the Android Studio-managed emulator cannot be located' \
      'Run the diagnostic from your normal user account inside `nix develop path:.`.'
    return
  fi

  studio_sdk_root="$HOME/Library/Android/sdk"
  emulator_path="$studio_sdk_root/emulator/emulator"
  if [ ! -x "$emulator_path" ]; then
    fail "Android Studio-managed emulator is missing ($(sanitize_path "$emulator_path"))" \
      'In Android Studio SDK Manager, install Android Emulator; keep this external SDK out of ANDROID_HOME and ANDROID_SDK_ROOT.'
    return
  fi
  pass "Android Studio-managed emulator is available ($(sanitize_path "$emulator_path"))"

  avd_output="$("$emulator_path" -list-avds 2>/dev/null)"
  if [ $? -ne 0 ]; then
    fail 'The Android Studio-managed emulator could not list AVDs' \
      'Open Android Studio Device Manager, repair its emulator setup, and create an AVD if needed.'
    return
  fi

  avd_count="$(printf '%s\n' "$avd_output" | awk 'NF { count += 1 } END { print count + 0 }')"
  if [ "$avd_count" -gt 0 ]; then
    pass "$avd_count Android Studio-managed AVD(s) detected"
  else
    fail 'No Android Studio-managed AVD was detected' \
      'Create at least one emulator in Android Studio Device Manager.'
  fi
}

print_summary() {
  local index

  printf '\nSummary: %d passed, %d failed.\n' "$PASS_COUNT" "$FAIL_COUNT"
  if [ "$FAIL_COUNT" -eq 0 ]; then
    printf 'M1 toolchain diagnostics passed.\n'
    return 0
  fi

  printf 'Required actions before M1 toolchain verification can pass:\n'
  index=0
  while [ "$index" -lt "$FAIL_COUNT" ]; do
    printf '  %d. %s\n' "$((index + 1))" "${FAILURE_TITLES[$index]}"
    printf '     %s\n' "${FAILURE_ACTIONS[$index]}"
    index=$((index + 1))
  done
  return 1
}

main() {
  require_expected_environment || return 1

  printf 'jamye-app M1 toolchain diagnostics (read-only)\n'
  printf 'Expected host: aarch64-darwin\n\n'

  check_host
  check_nix_shell
  check_xcode
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
  else
    fail 'Nix Android SDK component versions could not be checked' \
      'Fix ANDROID_SDK_ROOT through the devShell, then rerun this diagnostic.'
  fi

  check_android_studio_avd
  print_summary
}

main "$@"
