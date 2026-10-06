/**
 * @jest-environment node
 */
// The plugin runs in Node at prebuild time; the jest-expo React Native
// environment resolves `xcode`'s `uuid` dependency to its ESM browser build.
import type { ExportedConfig } from "expo/config-plugins";

type InfoPlist = Record<string, unknown>;
type SceneLifecyclePluginModule = {
  default: (config: ExportedConfig) => ExportedConfig;
  adoptSceneLifecycle: (appDelegate: string) => string;
  withSceneManifest: (infoPlist: InfoPlist) => InfoPlist;
  SCENE_DELEGATE_SOURCE: string;
};

const {
  default: withIosSceneLifecycle,
  adoptSceneLifecycle,
  withSceneManifest,
  SCENE_DELEGATE_SOURCE,
} = jest.requireActual<SceneLifecyclePluginModule>(
  "../../tools/expo/with-ios-scene-lifecycle.cjs",
);

// F-8/A18: the Expo SDK 57 prebuild template AppDelegate
// (expo-template-bare-minimum 57.0.28), which creates the window itself and
// never adopts the UIScene life cycle -- the shape that crashes at launch on
// iOS 27 when built with the iOS 27 SDK.
const SDK57_TEMPLATE_APP_DELEGATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }
}
`;

// The SDK 58 template (expo-template-bare-minimum 58.0.12) launch body.
const SDK58_LAUNCH_BODY = `    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // The window is created and React Native is started by \`SceneDelegate\` under the
    // scene-based life cycle (required by the iOS 27 SDK).
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }`;

describe("F-8 iOS scene life cycle config plugin", () => {
  test("rewrites the SDK 57 AppDelegate into the SDK 58 scene-based shape", () => {
    const adopted = adoptSceneLifecycle(SDK57_TEMPLATE_APP_DELEGATE);

    expect(adopted).toContain(
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
    );
    expect(adopted).toContain(SDK58_LAUNCH_BODY);
    expect(adopted).not.toContain("UIWindow(frame:");
    expect(adopted).not.toContain("startReactNative");
    // The scene delegate keeps routing URLs through these overrides.
    expect(adopted).toContain("RCTLinkingManager.application(app, open: url");
  });

  test("is idempotent when prebuild runs again without --clean", () => {
    const adopted = adoptSceneLifecycle(SDK57_TEMPLATE_APP_DELEGATE);

    expect(adoptSceneLifecycle(adopted)).toBe(adopted);
  });

  test("fails loudly instead of guessing when the template changes", () => {
    const changed = SDK57_TEMPLATE_APP_DELEGATE.replace(
      'withModuleName: "main"',
      'withModuleName: "other"',
    );

    expect(() => adoptSceneLifecycle(changed)).toThrow(/SDK 57 template/);
  });

  test("adds the single-window scene manifest naming SceneDelegate and keeps other keys", () => {
    expect(withSceneManifest({ CFBundleDisplayName: "Jamye" })).toEqual({
      CFBundleDisplayName: "Jamye",
      UIApplicationSceneManifest: {
        UIApplicationSupportsMultipleScenes: false,
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [
            {
              UISceneConfigurationName: "Default Configuration",
              UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
            },
          ],
        },
      },
    });
  });

  test("generates the SDK 58 template SceneDelegate on Expo's scene delegate", () => {
    expect(SCENE_DELEGATE_SOURCE).toBe(`internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`);
  });

  test("registers the Info.plist, AppDelegate, and Xcode project mods", () => {
    const config = withIosSceneLifecycle({ name: "Jamye", slug: "jamye-app" });

    expect(Object.keys(config.mods?.ios ?? {}).sort()).toEqual([
      "appDelegate",
      "infoPlist",
      "xcodeproj",
    ]);
  });
});
