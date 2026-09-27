import ExpoModulesCore
import ExpoUI
import SwiftUI

// T3: circular avatar view backed by SwiftUI's AsyncImage (async load + URL
// cache) instead of swift-ui `Image`, which decodes a remote `uiImage` URL
// synchronously on every render (see node_modules/@expo/ui/ios/ImageView.swift).
// Loading, failure, and a missing uri all render the same neutral monogram
// placeholder. `UIBaseViewProps` (from @expo/ui) supplies `testID` and the
// shared modifier system for free.
public final class JamyeAvatarViewProps: UIBaseViewProps {
  @Field var uri: String?
  @Field var name: String = ""
  @Field var size: Double = 40
  @Field var accentColorHex: String?
  @Field var backgroundColorHex: String?
}

public struct JamyeAvatarView: ExpoSwiftUI.View {
  @ObservedObject public var props: JamyeAvatarViewProps

  public init(props: JamyeAvatarViewProps) {
    self.props = props
  }

  private var monogram: String {
    let trimmed = props.name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let first = trimmed.first else { return "?" }
    return String(first).uppercased()
  }

  // No hex override falls back to genuine iOS semantic colors so the
  // placeholder tracks Dark Mode automatically without any JS-side plumbing.
  private var backgroundColor: Color {
    Self.parsedColor(props.backgroundColorHex) ?? Color(uiColor: .secondarySystemFill)
  }

  private var foregroundColor: Color {
    Self.parsedColor(props.accentColorHex) ?? Color(uiColor: .label)
  }

  @ViewBuilder
  private var monogramView: some View {
    Circle()
      .fill(backgroundColor)
      .overlay(
        Text(monogram)
          .font(.system(size: props.size * 0.44, weight: .semibold))
          .foregroundStyle(foregroundColor)
      )
  }

  public var body: some View {
    Group {
      if let uri = props.uri, !uri.isEmpty, let url = URL(string: uri) {
        AsyncImage(url: url) { phase in
          if case .success(let image) = phase {
            image.resizable().scaledToFill()
          } else {
            monogramView
          }
        }
      } else {
        monogramView
      }
    }
    .frame(width: props.size, height: props.size)
    .clipShape(Circle())
    // Decorative: the row/header text next to the avatar already announces
    // the person's name, so VoiceOver skips the image itself.
    .accessibilityHidden(true)
  }

  private static func parsedColor(_ hex: String?) -> Color? {
    guard var normalized = hex?.trimmingCharacters(in: .whitespacesAndNewlines),
      !normalized.isEmpty
    else { return nil }
    if normalized.hasPrefix("#") { normalized.removeFirst() }
    guard normalized.count == 6, let value = UInt32(normalized, radix: 16) else { return nil }
    let red = Double((value >> 16) & 0xFF) / 255
    let green = Double((value >> 8) & 0xFF) / 255
    let blue = Double(value & 0xFF) / 255
    return Color(red: red, green: green, blue: blue)
  }
}
