"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withAppDelegate,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");

// F-8/A18: an app built with the iOS 27 SDK does not launch on iOS 27 unless
// it adopts the UIScene life cycle (UIKit traps in
// `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`). The
// installed expo (SDK 57) already ships `ExpoAppSceneDelegate`, but the SDK 57
// prebuild template still creates the window in AppDelegate. This plugin
// ports the SDK 58 template's scene setup (expo-template-bare-minimum
// 58.0.12): the scene manifest, a `SceneDelegate`, and an AppDelegate that
// hands its factory to the scene delegate. Remove it with the SDK 58 upgrade.

const SCENE_DELEGATE_FILE_NAME = "SceneDelegate.swift";

const SCENE_DELEGATE_SOURCE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const SCENE_MANIFEST = Object.freeze({
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
      },
    ],
  },
});

const TEMPLATE_CLASS_DECLARATION = "class AppDelegate: ExpoAppDelegate {";
const ADOPTED_CLASS_DECLARATION =
  "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {";
// The SDK 57 template's window creation; under the scene life cycle
// `ExpoAppSceneDelegate` creates the window and starts React Native instead.
const TEMPLATE_WINDOW_START =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n {4}window = UIWindow\(frame: UIScreen\.main\.bounds\)\n {4}factory\.startReactNative\(\n {6}withModuleName: "main",\n {6}in: window,\n {6}launchOptions: launchOptions\)\n#endif\n\n/;
const SCENE_START_COMMENT =
  "\n    // The window is created and React Native is started by `SceneDelegate` under the\n    // scene-based life cycle (required by the iOS 27 SDK).\n";

/**
 * Rewrites the SDK 57 template AppDelegate into the SDK 58 shape. The
 * Linking/Universal Links overrides stay: `ExpoAppSceneDelegate` forwards
 * scene URL events to them and de-duplicates the `RCTLinkingManager`
 * notification. Throws instead of guessing when the template has changed.
 */
function adoptSceneLifecycle(appDelegate) {
  if (appDelegate.includes(ADOPTED_CLASS_DECLARATION)) return appDelegate;
  if (
    !appDelegate.includes(TEMPLATE_CLASS_DECLARATION) ||
    !TEMPLATE_WINDOW_START.test(appDelegate)
  ) {
    throw new Error(
      "with-ios-scene-lifecycle: AppDelegate.swift no longer matches the Expo SDK 57 template. Update this plugin, or remove it after the SDK 58 upgrade.",
    );
  }
  return appDelegate
    .replace(TEMPLATE_CLASS_DECLARATION, ADOPTED_CLASS_DECLARATION)
    .replace(TEMPLATE_WINDOW_START, SCENE_START_COMMENT);
}

function withSceneManifest(infoPlist) {
  return { ...infoPlist, UIApplicationSceneManifest: SCENE_MANIFEST };
}

function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (next) => {
    next.modResults = withSceneManifest(next.modResults);
    return next;
  });

  config = withAppDelegate(config, (next) => {
    if (next.modResults.language !== "swift") {
      throw new Error(
        `with-ios-scene-lifecycle: expected a Swift AppDelegate, got ${next.modResults.language}.`,
      );
    }
    next.modResults.contents = adoptSceneLifecycle(next.modResults.contents);
    return next;
  });

  return withXcodeProject(config, (next) => {
    const { platformProjectRoot, projectName } = next.modRequest;
    if (!projectName) {
      throw new Error(
        "with-ios-scene-lifecycle: the iOS project name is unavailable.",
      );
    }
    fs.writeFileSync(
      path.join(platformProjectRoot, projectName, SCENE_DELEGATE_FILE_NAME),
      SCENE_DELEGATE_SOURCE,
    );
    // Skips (no duplicate reference) when prebuild runs again without --clean.
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${projectName}/${SCENE_DELEGATE_FILE_NAME}`,
      groupName: projectName,
      project: next.modResults,
    });
    return next;
  });
}

module.exports = {
  default: withIosSceneLifecycle,
  adoptSceneLifecycle,
  withSceneManifest,
  SCENE_DELEGATE_SOURCE,
  SCENE_MANIFEST,
};
