package dev.jamye.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.views.ComposeProps
import java.io.Serializable

// T1 (Android): items travel past -> today; reverseLayout=true both reverses
// scroll/layout direction and makes index 0 the initial (no-scroll-needed)
// visible position, so reversing the list puts today (the original last
// item) at index 0 -- landing it at the right edge and already on screen,
// matching "오늘이 오른쪽 끝, 처음 보이는 위치도 오른쪽 끝".
class JamyeDateChipItem : Record, Serializable {
  @Field val key: String = ""
  @Field val label: String = ""
}

class JamyeDateChipSelectEvent : Record, Serializable {
  @Field var key: String = ""
}

data class JamyeDateChipRowProps(
  val items: List<JamyeDateChipItem> = emptyList(),
  val selectedKey: String = "",
  val accentColorHex: String = "",
  val surfaceColorHex: String? = null,
  val testID: String? = null
) : ComposeProps

private fun parseHexColor(hex: String?): Color? {
  if (hex.isNullOrBlank()) return null
  val normalized = hex.trim().removePrefix("#")
  return try {
    when (normalized.length) {
      6 -> Color(("FF" + normalized).toLong(16).toInt())
      8 -> Color(normalized.toLong(16).toInt())
      else -> null
    }
  } catch (error: NumberFormatException) {
    null
  }
}

@Composable
private fun JamyeDateChipRowContent(
  props: JamyeDateChipRowProps,
  onSelect: (JamyeDateChipSelectEvent) -> Unit
) {
  val accent = parseHexColor(props.accentColorHex) ?: MaterialTheme.colorScheme.primary
  val onAccent = if (accent.luminance() > 0.5f) Color.Black else Color.White
  val surface = parseHexColor(props.surfaceColorHex)
  val orderedItems = props.items.reversed()
  val rowModifier = props.testID?.let { Modifier.fillMaxWidth().testTag(it) }
    ?: Modifier.fillMaxWidth()

  LazyRow(
    reverseLayout = true,
    horizontalArrangement = Arrangement.spacedBy(8.dp),
    contentPadding = PaddingValues(horizontal = 16.dp),
    modifier = rowModifier
  ) {
    items(orderedItems, key = { it.key }) { item ->
      val selected = item.key == props.selectedKey
      val colors = if (surface != null) {
        FilterChipDefaults.filterChipColors(
          containerColor = surface,
          selectedContainerColor = accent,
          selectedLabelColor = onAccent
        )
      } else {
        FilterChipDefaults.filterChipColors(
          selectedContainerColor = accent,
          selectedLabelColor = onAccent
        )
      }
      FilterChip(
        selected = selected,
        onClick = {
          val event = JamyeDateChipSelectEvent()
          event.key = item.key
          onSelect(event)
        },
        label = { Text(item.label) },
        colors = colors
      )
    }
  }
}

// Local expo-ui Compose extension (M14 round 1, A1): registers
// JamyeDateChipRowView through expo-modules-core's ModuleDefinitionBuilderWithCompose
// functional View<Props>(name) DSL -- the same mechanism @expo/ui's own
// ExpoUIView<Props>(name) wraps (node_modules/@expo/ui/android/src/main/java/expo/modules/ui/UIBaseView.kt)
// -- so it composes inside the same expo-ui Host tree and shares the Host's
// Berry-seeded MaterialTheme (ADR 0011 D3).
class JamyeUiModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("JamyeUi")

    View<JamyeDateChipRowProps>("JamyeDateChipRowView") {
      // "onSelect" would register as `topSelect`, which React Native already
      // declares as a bubbling event (TextInput) -> "cannot be both direct and
      // bubbling" at render time. Keep the event name unique.
      val onDateSelect by Event<JamyeDateChipSelectEvent>()

      Content { props ->
        JamyeDateChipRowContent(props) { event -> onDateSelect(event) }
      }
    }
  }
}
