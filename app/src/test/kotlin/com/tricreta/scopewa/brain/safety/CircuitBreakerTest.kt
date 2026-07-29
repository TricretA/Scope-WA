package com.tricreta.scopewa.brain.safety

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CircuitBreakerTest {

    private fun healthyState(overrides: CampaignSafetyState.() -> CampaignSafetyState = { this }) =
        CampaignSafetyState(
            consecutiveFailures = 0,
            whatsAppShowedRestrictionDialog = false,
            sentInCurrentBatch = 3,
            repliesInCurrentBatch = 1,
            batchSizeForReplyCheck = 20,
            sentToday = 5,
            dailyCap = 30,
            currentHour = 12,
            activeHoursStart = 8,
            activeHoursEnd = 20
        ).overrides()

    @Test
    fun `healthy state does not pause`() {
        assertNull(CircuitBreaker.checkPauseReason(healthyState()))
    }

    @Test
    fun `three consecutive failures pauses`() {
        val state = healthyState { copy(consecutiveFailures = 3) }
        assertEquals(PauseReason.ConsecutiveFailures, CircuitBreaker.checkPauseReason(state))
    }

    @Test
    fun `a restriction dialog pauses immediately regardless of failure count`() {
        val state = healthyState { copy(whatsAppShowedRestrictionDialog = true) }
        assertEquals(PauseReason.RestrictionDialogShown, CircuitBreaker.checkPauseReason(state))
    }

    @Test
    fun `reaching the daily cap pauses`() {
        val state = healthyState { copy(sentToday = 30, dailyCap = 30) }
        assertEquals(PauseReason.DailyCapReached, CircuitBreaker.checkPauseReason(state))
    }

    @Test
    fun `outside active hours pauses`() {
        val state = healthyState { copy(currentHour = 22, activeHoursStart = 8, activeHoursEnd = 20) }
        assertEquals(PauseReason.OutsideActiveHours, CircuitBreaker.checkPauseReason(state))
    }

    @Test
    fun `a full batch with zero replies pauses as a cold batch`() {
        val state = healthyState {
            copy(sentInCurrentBatch = 20, repliesInCurrentBatch = 0, batchSizeForReplyCheck = 20)
        }
        assertEquals(PauseReason.ColdBatchNoReplies, CircuitBreaker.checkPauseReason(state))
    }

    @Test
    fun `consecutive failures takes priority over other reasons`() {
        val state = healthyState {
            copy(consecutiveFailures = 3, sentToday = 30, dailyCap = 30)
        }
        assertEquals(PauseReason.ConsecutiveFailures, CircuitBreaker.checkPauseReason(state))
    }
}
