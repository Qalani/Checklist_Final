package com.zenworkspace.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.LooperMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w640dp-h320dp-land-mdpi")
@LooperMode(LooperMode.Mode.PAUSED)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AuthContentLayoutTest {
    @get:Rule val compose = createComposeRule()

    @Test fun recoveryCanBeCancelledWhileTheSessionIsExpiredOrARequestIsStillBusy() {
        var cancelled = 0
        compose.setContent {
            MaterialTheme {
                PasswordRecoveryContent(busy = true, message = "Your session expired. Start recovery again.",
                    onUpdate = {}, onCancel = { cancelled++ })
            }
        }
        compose.onNodeWithText("Update password").assertIsNotEnabled()
        compose.onNodeWithText("Cancel recovery").assertIsDisplayed().assertHeightIsAtLeast(48.dp).performClick()
        compose.runOnIdle { assertEquals(1, cancelled) }
    }
}
