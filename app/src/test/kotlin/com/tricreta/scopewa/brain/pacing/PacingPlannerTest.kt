package com.tricreta.scopewa.brain.pacing

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PacingPlannerTest {

    @Test
    fun `delay always falls within the profile's range`() {
        val planner = PacingPlanner(PacingProfiles.Normal, Random(seed = 42))
        repeat(200) {
            val delay = planner.nextDelaySeconds()
            assertTrue(delay in PacingProfiles.Normal.minDelaySeconds..PacingProfiles.Normal.maxDelaySeconds)
        }
    }

    @Test
    fun `long pause is due exactly every pauseEveryMessages`() {
        val planner = PacingPlanner(PacingProfiles.Normal)
        val every = PacingProfiles.Normal.pauseEveryMessages
        assertFalse(planner.isLongPauseDue(0))
        assertFalse(planner.isLongPauseDue(every - 1))
        assertTrue(planner.isLongPauseDue(every))
        assertTrue(planner.isLongPauseDue(every * 2))
    }

    @Test
    fun `long pause duration falls within the profile's range`() {
        val planner = PacingPlanner(PacingProfiles.Normal, Random(seed = 7))
        repeat(200) {
            val pauseSeconds = planner.nextLongPauseSeconds()
            val minSeconds = PacingProfiles.Normal.longPauseMinMinutes * 60
            val maxSeconds = PacingProfiles.Normal.longPauseMaxMinutes * 60
            assertTrue(pauseSeconds in minSeconds..maxSeconds)
        }
    }

    @Test
    fun `fast profile is strictly faster than safe profile`() {
        assertTrue(PacingProfiles.Fast.minDelaySeconds < PacingProfiles.Safe.minDelaySeconds)
        assertEquals("Fast", PacingProfiles.Fast.name)
    }
}
