import { Stack } from "expo-router";

import { useNativeStackScreenOptions } from "@/shared/ui/native-stack-screen-options";

export default function TabStackLayout() {
  return <Stack screenOptions={useNativeStackScreenOptions()} />;
}
