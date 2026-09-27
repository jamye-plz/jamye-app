import ExpoModulesCore
import ExpoUI

// Local expo-ui SwiftUI extension (M14 round 1, A1): registers JamyeAvatarView
// through @expo/ui's own ExpoUIView(_:) helper so it composes inside the same
// expo-ui Host SwiftUI tree as the built-in components (see UIBaseView.swift
// in node_modules/@expo/ui/ios), instead of standing alone as an isolated
// Fabric view.
public final class JamyeUiModule: Module {
  public func definition() -> ModuleDefinition {
    Name("JamyeUi")

    ExpoUIView(JamyeAvatarView.self)
  }
}
