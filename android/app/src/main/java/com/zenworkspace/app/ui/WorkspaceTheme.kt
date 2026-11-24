package com.zenworkspace.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val zenScheme = lightColorScheme(
    primary = Color(0xFF5738A0),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEAE0FF),
    onPrimaryContainer = Color(0xFF321966),
    secondary = Color(0xFF50568B),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE4E6FF),
    onSecondaryContainer = Color(0xFF242952),
    tertiary = Color(0xFF8D4439),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFDDD3),
    onTertiaryContainer = Color(0xFF522116),
    background = Color(0xFFF7F4FC),
    onBackground = Color(0xFF251B35),
    surface = Color(0xFFFFFCFF),
    onSurface = Color(0xFF251B35),
    surfaceVariant = Color(0xFFECE5F5),
    onSurfaceVariant = Color(0xFF51465D),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF8F3FC),
    surfaceContainer = Color(0xFFF0EAF7),
    surfaceContainerHigh = Color(0xFFECE3F4),
    surfaceContainerHighest = Color(0xFFE6DEEE),
    outline = Color(0xFF82738F),
    outlineVariant = Color(0xFFDCCFE9),
    inverseSurface = Color(0xFF30263F),
    inverseOnSurface = Color(0xFFF7EEFF),
    inversePrimary = Color(0xFFD8C4FF),
    surfaceTint = Color(0xFF5738A0),
)

private val dawnScheme = zenScheme.copy(
    primary = Color(0xFF923D48),
    primaryContainer = Color(0xFFFFDDD9),
    onPrimaryContainer = Color(0xFF581F28),
    secondary = Color(0xFF73584C),
    secondaryContainer = Color(0xFFF7E1D4),
    onSecondaryContainer = Color(0xFF442C20),
    tertiary = Color(0xFF6D4B8A),
    tertiaryContainer = Color(0xFFEFDCFC),
    onTertiaryContainer = Color(0xFF402356),
    background = Color(0xFFFCF4EE),
    onBackground = Color(0xFF352521),
    surface = Color(0xFFFFFBF7),
    onSurface = Color(0xFF352521),
    surfaceVariant = Color(0xFFF4E5DD),
    onSurfaceVariant = Color(0xFF624A43),
    surfaceContainerLowest = Color(0xFFFFFDFC),
    surfaceContainerLow = Color(0xFFFCF3EC),
    surfaceContainer = Color(0xFFF7EBE4),
    surfaceContainerHigh = Color(0xFFF3E4DA),
    surfaceContainerHighest = Color(0xFFEFE0D6),
    outline = Color(0xFF90766A),
    outlineVariant = Color(0xFFE4D1C6),
    inverseSurface = Color(0xFF402D28),
    inverseOnSurface = Color(0xFFFFEFE7),
    inversePrimary = Color(0xFFFFB4B7),
    surfaceTint = Color(0xFF923D48),
)

private val midnightScheme = darkColorScheme(
    primary = Color(0xFFD5BFFF),
    onPrimary = Color(0xFF311563),
    primaryContainer = Color(0xFF4B3278),
    onPrimaryContainer = Color(0xFFF1E6FF),
    secondary = Color(0xFFBFC4FC),
    onSecondary = Color(0xFF282D59),
    secondaryContainer = Color(0xFF383F70),
    onSecondaryContainer = Color(0xFFE5E7FF),
    tertiary = Color(0xFFFFBBA9),
    onTertiary = Color(0xFF582D27),
    tertiaryContainer = Color(0xFF6B3C36),
    onTertiaryContainer = Color(0xFFFFE2DA),
    background = Color(0xFF141221),
    onBackground = Color(0xFFF2ECFF),
    surface = Color(0xFF1D192D),
    onSurface = Color(0xFFF2ECFF),
    surfaceVariant = Color(0xFF343048),
    onSurfaceVariant = Color(0xFFCFC5E0),
    surfaceContainerLowest = Color(0xFF100E1D),
    surfaceContainerLow = Color(0xFF201B30),
    surfaceContainer = Color(0xFF27213A),
    surfaceContainerHigh = Color(0xFF302742),
    surfaceContainerHighest = Color(0xFF3B314E),
    outline = Color(0xFFA497B8),
    outlineVariant = Color(0xFF514664),
    inverseSurface = Color(0xFFECE4F6),
    inverseOnSurface = Color(0xFF30253E),
    inversePrimary = Color(0xFF553692),
    surfaceTint = Color(0xFFD5BFFF),
)

private val forestScheme = midnightScheme.copy(
    primary = Color(0xFFBEE6A4),
    onPrimary = Color(0xFF213B16),
    primaryContainer = Color(0xFF3B5631),
    onPrimaryContainer = Color(0xFFE0F5D6),
    secondary = Color(0xFF8CDDD4),
    onSecondary = Color(0xFF133C36),
    secondaryContainer = Color(0xFF29534B),
    onSecondaryContainer = Color(0xFFCEF5EC),
    tertiary = Color(0xFFFAD19A),
    onTertiary = Color(0xFF482F1B),
    tertiaryContainer = Color(0xFF654A2F),
    onTertiaryContainer = Color(0xFFFFE7C4),
    background = Color(0xFF111F1B),
    onBackground = Color(0xFFEAF4EC),
    surface = Color(0xFF1B2C25),
    onSurface = Color(0xFFEAF4EC),
    surfaceVariant = Color(0xFF30423A),
    onSurfaceVariant = Color(0xFFC6D8CE),
    surfaceContainerLowest = Color(0xFF0D1A15),
    surfaceContainerLow = Color(0xFF1D2D26),
    surfaceContainer = Color(0xFF25372F),
    surfaceContainerHigh = Color(0xFF2D4137),
    surfaceContainerHighest = Color(0xFF384C41),
    outline = Color(0xFF94B0A1),
    outlineVariant = Color(0xFF485F53),
    inverseSurface = Color(0xFFE8F4E8),
    inverseOnSurface = Color(0xFF23342C),
    inversePrimary = Color(0xFF415F32),
    surfaceTint = Color(0xFFBEE6A4),
)

private val typography = Typography().run {
    copy(
        headlineLarge = headlineLarge.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.9).sp),
        headlineMedium = headlineMedium.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.6).sp),
        headlineSmall = headlineSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.35).sp),
        titleLarge = titleLarge.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
        titleMedium = titleMedium.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.sp),
        titleSmall = titleSmall.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = labelLarge.copy(fontWeight = FontWeight.SemiBold),
    )
}

private val shapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

private data class BannerPalette(val start: Color, val end: Color, val glow: Color)

private val zenBanner = BannerPalette(Color(0xFF302054), Color(0xFF4E338C), Color(0xFFDFC1FF))
private val dawnBanner = BannerPalette(Color(0xFF54253D), Color(0xFF8D3D43), Color(0xFFFFC5A9))
private val midnightBanner = BannerPalette(Color(0xFF292049), Color(0xFF3E347E), Color(0xFFBAABFF))
private val forestBanner = BannerPalette(Color(0xFF1E3A30), Color(0xFF325745), Color(0xFFD3F7A5))
private val LocalBannerPalette = staticCompositionLocalOf { zenBanner }

@Composable
internal fun WorkspaceTheme(appearance: String, dark: Boolean, content: @Composable () -> Unit) {
    val scheme = when (appearance) {
        "dawn" -> dawnScheme
        "forest" -> forestScheme
        else -> if (dark) midnightScheme else zenScheme
    }
    val banner = when (appearance) {
        "dawn" -> dawnBanner
        "forest" -> forestBanner
        else -> if (dark) midnightBanner else zenBanner
    }
    CompositionLocalProvider(LocalBannerPalette provides banner) {
        MaterialTheme(colorScheme = scheme, typography = typography, shapes = shapes, content = content)
    }
}

internal data class WorkspaceTone(val ink: Color, val fill: Color, val accent: Color) {
    val onInk: Color get() = if (ink.luminance() > 0.45f) Color(0xFF221832) else Color.White
}

private data class Accent(val ink: Color, val light: Color, val dark: Color)

private val violet = Accent(Color(0xFF562E99), Color(0xFFB283F6), Color(0xFFD8BDFF))
private val aqua = Accent(Color(0xFF176069), Color(0xFF6CCDC3), Color(0xFF91EEE0))
private val peach = Accent(Color(0xFF8D402F), Color(0xFFF1A782), Color(0xFFFFC9AF))
private val blue = Accent(Color(0xFF38499B), Color(0xFF91A6FF), Color(0xFFC2CAFF))
private val rose = Accent(Color(0xFF8C3762), Color(0xFFE794BA), Color(0xFFFFBAD7))
private val lime = Accent(Color(0xFF455D26), Color(0xFFABC878), Color(0xFFD0E6AE))

@Composable
internal fun workspaceTone(section: String): WorkspaceTone {
    val accent = when (section) {
        "tasks", "home" -> violet
        "lists", "list_items" -> aqua
        "notes", "zen_reminders" -> peach
        "calendar_events", "settings" -> blue
        "friends" -> rose
        "insights", "categories" -> lime
        else -> violet
    }
    val surface = MaterialTheme.colorScheme.surface
    val isDark = surface.luminance() < 0.35f
    val shade = if (isDark) accent.dark else accent.light
    return WorkspaceTone(
        ink = if (isDark) accent.dark else accent.ink,
        fill = lerp(surface, shade, if (isDark) 0.17f else 0.23f),
        accent = shade,
    )
}

@Composable
internal fun AccentIcon(icon: ImageVector, tone: WorkspaceTone, size: Dp = 36.dp, modifier: Modifier = Modifier) {
    Box(
        modifier.size(size).background(tone.fill, MaterialTheme.shapes.small),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tone.ink, modifier = Modifier.size(size * 0.55f))
    }
}

/** A drawn mark stays sharp at every density and needs no image download. */
@Composable
internal fun WorkspaceMark(modifier: Modifier = Modifier, onBanner: Boolean = false) {
    val scheme = MaterialTheme.colorScheme
    val shape = MaterialTheme.shapes.small
    val ink = if (onBanner) Color.White else scheme.onPrimary
    val fill = if (onBanner) Color.White.copy(alpha = 0.16f) else scheme.primary
    Canvas(modifier.background(fill, shape)) {
        val stroke = size.minDimension * 0.074f
        drawLine(ink, Offset(size.width * .23f, size.height * .52f),
            Offset(size.width * .44f, size.height * .72f), stroke, StrokeCap.Round)
        drawLine(ink, Offset(size.width * .44f, size.height * .72f),
            Offset(size.width * .76f, size.height * .33f), stroke, StrokeCap.Round)
        drawCircle(ink.copy(alpha = .84f), radius = size.minDimension * .047f,
            center = Offset(size.width * .72f, size.height * .71f))
    }
}

@Composable
internal fun WorkspaceBanner(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val palette = LocalBannerPalette.current
    Box(modifier.clip(MaterialTheme.shapes.extraLarge).background(
        Brush.linearGradient(listOf(palette.start, palette.end)),
    )) {
        Canvas(Modifier.matchParentSize()) {
            val orbit = Offset(size.width * 0.94f, size.height * 0.22f)
            drawCircle(palette.glow.copy(alpha = 0.13f), radius = size.height * 0.76f, center = orbit)
            drawCircle(palette.glow.copy(alpha = 0.09f), radius = size.height * 0.46f,
                center = Offset(size.width * 0.78f, size.height * 1.06f))
            drawCircle(palette.glow.copy(alpha = 0.72f), radius = 3.dp.toPx(),
                center = Offset(size.width * 0.91f, size.height * 0.74f))
            drawCircle(palette.glow.copy(alpha = 0.46f), radius = 2.dp.toPx(),
                center = Offset(size.width * 0.83f, size.height * 0.23f))
        }
        content()
    }
}
