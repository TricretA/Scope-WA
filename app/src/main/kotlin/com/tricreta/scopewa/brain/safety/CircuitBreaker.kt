package com.tricreta.scopewa.brain.safety

/** Snapshot the job runner reports before sending the next message. */
data class CampaignSafetyState(
    val consecutiveFailures: Int,
    val whatsAppShowedRestrictionDialog: Boolean,
    val sentInCurrentBatch: Int,
    val repliesInCurrentBatch: Int,
    val batchSizeForReplyCheck: Int,
    val sentToday: Int,
    val dailyCap: Int,
    val currentHour: Int,
    val activeHoursStart: Int,
    val activeHoursEnd: Int
)

enum class PauseReason {
    ConsecutiveFailures,
    RestrictionDialogShown,
    ColdBatchNoReplies,
    DailyCapReached,
    OutsideActiveHours
}

/**
 * Pure-logic gate the job runner asks before every send — architecture doc
 * section 6, layer 4. Pausing is always safe: the job survives and resumes.
 * This never decides to "keep trying" past a limit.
 */
object CircuitBreaker {

    private const val MAX_CONSECUTIVE_FAILURES = 3

    fun checkPauseReason(state: CampaignSafetyState): PauseReason? = when {
        state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES -> PauseReason.ConsecutiveFailures
        state.whatsAppShowedRestrictionDialog -> PauseReason.RestrictionDialogShown
        state.sentToday >= state.dailyCap -> PauseReason.DailyCapReached
        isOutsideActiveHours(state) -> PauseReason.OutsideActiveHours
        isColdBatch(state) -> PauseReason.ColdBatchNoReplies
        else -> null
    }

    private fun isOutsideActiveHours(state: CampaignSafetyState): Boolean {
        val hour = state.currentHour
        return if (state.activeHoursStart <= state.activeHoursEnd) {
            hour < state.activeHoursStart || hour >= state.activeHoursEnd
        } else {
            // Active window wraps past midnight.
            hour < state.activeHoursStart && hour >= state.activeHoursEnd
        }
    }

    private fun isColdBatch(state: CampaignSafetyState): Boolean =
        state.sentInCurrentBatch >= state.batchSizeForReplyCheck && state.repliesInCurrentBatch == 0
}
