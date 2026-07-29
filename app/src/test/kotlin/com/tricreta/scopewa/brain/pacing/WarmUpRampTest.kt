package com.tricreta.scopewa.brain.pacing

import org.junit.Assert.assertEquals
import org.junit.Test

class WarmUpRampTest {

    private val ramp = WarmUpRamp(ceiling = 250)

    @Test
    fun `day 1 and 2 are capped at 20`() {
        assertEquals(20, ramp.dailyCapFor(1))
        assertEquals(20, ramp.dailyCapFor(2))
    }

    @Test
    fun `day 3 and 4 are capped at 40`() {
        assertEquals(40, ramp.dailyCapFor(3))
        assertEquals(40, ramp.dailyCapFor(4))
    }

    @Test
    fun `day 5 through 7 are capped at 80`() {
        assertEquals(80, ramp.dailyCapFor(5))
        assertEquals(80, ramp.dailyCapFor(7))
    }

    @Test
    fun `second week is capped at 150`() {
        assertEquals(150, ramp.dailyCapFor(8))
        assertEquals(150, ramp.dailyCapFor(14))
    }

    @Test
    fun `after two weeks the account ceiling applies`() {
        assertEquals(250, ramp.dailyCapFor(15))
        assertEquals(250, ramp.dailyCapFor(90))
    }

    @Test
    fun `a lower client ceiling caps the ramp even after warm-up`() {
        val lowerCeilingRamp = WarmUpRamp(ceiling = 100)
        assertEquals(80, lowerCeilingRamp.dailyCapFor(7))
        assertEquals(100, lowerCeilingRamp.dailyCapFor(15))
    }
}
