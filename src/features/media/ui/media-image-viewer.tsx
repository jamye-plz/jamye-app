import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appSpacing } from "@/core/theme/tokens";
import { clampImageOffset, clampImageZoom } from "../model/media-image-zoom";
import { MediaViewerModal } from "./media-viewer-modal";

export function MediaImageViewer({
  uri,
  label,
  onClose,
  onError,
}: Readonly<{
  uri: string;
  label: string;
  onClose: () => void;
  onError: () => void;
}>) {
  const { colors } = useAppTheme();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  useEffect(() => {
    scale.set(1);
    x.set(0);
    y.set(0);
  }, [uri, viewport.width, viewport.height, scale, x, y]);
  const setZoom = (value: number) => {
    scale.set(clampImageZoom(value));
    x.set(0);
    y.set(0);
  };
  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.set(scale.get());
    })
    .onUpdate((event) => {
      const next = clampImageZoom(startScale.get() * event.scale);
      scale.set(next);
      x.set(clampImageOffset(x.get(), viewport.width, next));
      y.set(clampImageOffset(y.get(), viewport.height, next));
    });
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      startX.set(x.get());
      startY.set(y.get());
    })
    .onUpdate((event) => {
      x.set(
        clampImageOffset(
          startX.get() + event.translationX,
          viewport.width,
          scale.get(),
        ),
      );
      y.set(
        clampImageOffset(
          startY.get() + event.translationY,
          viewport.height,
          scale.get(),
        ),
      );
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_event, success) => {
      if (!success) return;
      scale.set(scale.get() > 1 ? 1 : 2);
      x.set(0);
      y.set(0);
    });
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      { scale: scale.get() },
    ],
  }));
  return (
    <MediaViewerModal label={label} closeLabel="사진 닫기" onClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{ flex: 1, overflow: "hidden" }}
          onLayout={({ nativeEvent }) => setViewport(nativeEvent.layout)}
        >
          <GestureDetector
            gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}
          >
            <Animated.Image
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${label} 상세 이미지`}
              source={{ uri }}
              resizeMode="contain"
              onError={onError}
              style={[{ width: "100%", height: "100%" }, imageStyle]}
            />
          </GestureDetector>
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: appSpacing.md,
          }}
        >
          {[
            {
              label: "사진 축소",
              text: "축소",
              change: () => setZoom(scale.get() - 1),
            },
            {
              label: "사진 화면에 맞춤",
              text: "맞춤",
              change: () => setZoom(1),
            },
            {
              label: "사진 확대",
              text: "확대",
              change: () => setZoom(scale.get() + 1),
            },
          ].map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.change}
              style={{
                minHeight: appControl.standardHeight,
                minWidth: appControl.standardHeight,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.primary }}>{action.text}</Text>
            </Pressable>
          ))}
        </View>
      </GestureHandlerRootView>
    </MediaViewerModal>
  );
}
