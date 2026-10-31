package com.zenworkspace.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import com.zenworkspace.app.data.Row
import com.zenworkspace.app.data.WorkspaceState
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w320dp-h480dp-mdpi")
@LooperMode(LooperMode.Mode.PAUSED)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CollaborationLayoutTest {
    @get:Rule val compose = createComposeRule()

    @Test fun longFriendRequestFitsNarrowViewportAndRetainsAccessibleActions() {
        val calls = mutableListOf<Pair<String, JSONObject>>()
        val email = "averylong.email.address.for.a.shared.workspace@example-organisation.example"
        val request = Row(JSONObject().put("id", "request").put("target_id", "me")
            .put("requester_id", "friend").put("requester_email", email).put("status", "pending"))
        compose.setContent { MaterialTheme {
            Box(Modifier.requiredSize(320.dp, 400.dp)) {
                FriendsScreen(WorkspaceState(userId = "me", rows = mapOf("friend_requests" to listOf(request)))) { name, body -> calls += name to body }
            }
        } }

        compose.onNodeWithText(email).assertIsDisplayed()
        compose.onNodeWithText("Accept").assertIsDisplayed().assertHeightIsAtLeast(48.dp).performClick()
        compose.onNodeWithText("Decline").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        val viewport = compose.onNodeWithTag("friends-content").fetchSemanticsNode().boundsInRoot
        assertHorizontallyInside(compose.onNodeWithText(email).fetchSemanticsNode().boundsInRoot, viewport)
        compose.runOnIdle {
            assertEquals("respond_to_friend_request", calls.single().first)
            assertEquals("request", calls.single().second.getString("request_id"))
            assertEquals("accept", calls.single().second.getString("action"))
        }
    }

    @Test fun narrowSharingFormKeepsRoleAndInviteInReach() {
        val invitations = mutableListOf<Pair<String, String>>()
        compose.setContent { MaterialTheme {
            SharingPanel(SharingPresentation("item", "Weekly shopping", false, emptyList(), true),
                Modifier.requiredSize(320.dp, 260.dp), onDismiss = {},
                onInvite = { email, role -> invitations += email to role }, onMemberRole = {}, onRemoveMember = {},
                onEnablePublic = {}, onShareLink = {}, onRotatePublic = {}, onDisablePublic = {})
        } }

        compose.onNodeWithText("Invite by email").performTextInput("friend@example.com")
        compose.onNodeWithText("Editor").performClick()
        compose.onNodeWithText("Invite").assertIsDisplayed().assertHeightIsAtLeast(48.dp).performClick()
        compose.onNodeWithText("Done").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        compose.runOnIdle { assertEquals(listOf("friend@example.com" to "editor"), invitations) }
    }

    @Config(sdk = [35], qualifiers = "w640dp-h320dp-mdpi")
    @Test fun shortLandscapeSharingScrollsLongContentWithoutMovingDone() {
        val email = "averylong.member.address.with.a.long.team.name@example-organisation.example"
        val token = "a".repeat(100)
        val url = "https://zenchecklist.vercel.app/lists/share/$token"
        val member = Row(JSONObject().put("id", "member").put("user_email", email).put("role", "viewer"))
        var disabled = false
        compose.setContent { MaterialTheme {
            SharingPanel(SharingPresentation("item", "A shared list with a descriptive name", false, listOf(member), true, publicToken = token),
                Modifier.requiredSize(640.dp, 220.dp), onDismiss = {}, onInvite = { _, _ -> },
                onMemberRole = {}, onRemoveMember = {}, onEnablePublic = {}, onShareLink = {}, onRotatePublic = {},
                onDisablePublic = { disabled = true })
        } }

        val doneBefore = compose.onNodeWithText("Done").fetchSemanticsNode().boundsInRoot
        compose.onNodeWithTag("sharing-content").performScrollToNode(hasText(url))
        val panel = compose.onNodeWithTag("sharing-panel").fetchSemanticsNode().boundsInRoot
        assertHorizontallyInside(compose.onNodeWithText(url).fetchSemanticsNode().boundsInRoot, panel)
        compose.onNodeWithTag("sharing-content").performScrollToNode(hasText("Disable sharing"))
        compose.onNodeWithText("Disable sharing").assertIsDisplayed().assertHeightIsAtLeast(48.dp).performClick()
        compose.onNodeWithText("Done").assertIsDisplayed()
        val doneAfter = compose.onNodeWithText("Done").fetchSemanticsNode().boundsInRoot
        assertEquals(doneBefore.top, doneAfter.top, .1f)
        compose.runOnIdle { assertTrue(disabled) }
    }

    private fun assertHorizontallyInside(child: Rect, parent: Rect) {
        assertTrue("Content starts inside the viewport", child.left >= parent.left - .1f)
        assertTrue("Content ends inside the viewport", child.right <= parent.right + .1f)
    }
}
