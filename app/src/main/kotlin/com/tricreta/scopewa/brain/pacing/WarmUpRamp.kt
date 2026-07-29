package com.tricreta.scopewa.brain.pacing

/**
 * Enforces the daily send-cap ramp for a fresh number — architecture doc
 * section 6, layer 2. Going from 0 to hundreds on day one is the fastest
 * ban there is, so this ramp is a hard ceiling, not a suggestion.
 *
 * @param ceiling the account's chosen steady-state daily cap once warmed up
 *   (client asked for 250 initially, or as low as his 5,000-contacts/day-max
 *   answer in section 10 allows).
 */
class WarmUpRamp(private val ceiling: Int = DEFAULT_CEILING) {

    /** @param numberAgeDays days since this number started sending campaigns, starting at 1. */
    fun dailyCapFor(numberAgeDays: Int): Int {
        require(numberAgeDays >= 1) { "numberAgeDays must be at least 1" }
        val ramped = when {
            numberAgeDays <= 2 -> 20
            numberAgeDays <= 4 -> 40
            numberAgeDays <= 7 -> 80
            numberAgeDays <= 14 -> 150
            else -> ceiling
        }
        return minOf(ramped, ceiling)
    }

    companion object {
        const val DEFAULT_CEILING = 250
    }
}
