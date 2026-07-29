package com.tricreta.scopewa.brain.pacing

import kotlin.random.Random

/**
 * One tunable pacing profile — architecture doc section 6 layer 2 and
 * section 7 ("Safe / Normal / Fast" one-tap presets).
 */
data class PacingProfile(
    val name: String,
    val minDelaySeconds: Int,
    val maxDelaySeconds: Int,
    val pauseEveryMessages: Int,
    val longPauseMinMinutes: Int,
    val longPauseMaxMinutes: Int
)

object PacingProfiles {
    val Safe = PacingProfile(
        name = "Safe",
        minDelaySeconds = 45,
        maxDelaySeconds = 120,
        pauseEveryMessages = 8,
        longPauseMinMinutes = 6,
        longPauseMaxMinutes = 12
    )

    /** Default profile — the numbers from architecture doc section 6. */
    val Normal = PacingProfile(
        name = "Normal",
        minDelaySeconds = 25,
        maxDelaySeconds = 90,
        pauseEveryMessages = 12,
        longPauseMinMinutes = 4,
        longPauseMaxMinutes = 8
    )

    val Fast = PacingProfile(
        name = "Fast",
        minDelaySeconds = 12,
        maxDelaySeconds = 40,
        pauseEveryMessages = 15,
        longPauseMinMinutes = 2,
        longPauseMaxMinutes = 5
    )
}

/**
 * Turns a [PacingProfile] into concrete wait times for the job runner.
 * Deliberately randomised within the profile's range on every call — fixed
 * intervals are themselves a fingerprint (section 6, layer 2).
 */
class PacingPlanner(
    private val profile: PacingProfile,
    private val random: Random = Random.Default
) {

    fun nextDelaySeconds(): Int =
        random.nextInt(profile.minDelaySeconds, profile.maxDelaySeconds + 1)

    fun isLongPauseDue(messagesSentSinceLastPause: Int): Boolean =
        messagesSentSinceLastPause > 0 && messagesSentSinceLastPause % profile.pauseEveryMessages == 0

    fun nextLongPauseSeconds(): Int =
        random.nextInt(profile.longPauseMinMinutes * 60, profile.longPauseMaxMinutes * 60 + 1)
}
