package com.tricreta.scopewa.brain.uniqueness

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UniquenessScorerTest {

    @Test
    fun `all unique messages score 100 percent with no warning`() {
        val result = UniquenessScorer.score(listOf("Hi A", "Hi B", "Hi C"))
        assertEquals(100, result.uniquePercent)
        assertFalse(result.hasWarning)
    }

    @Test
    fun `every occurrence of a duplicated message is flagged, not just the repeats`() {
        val result = UniquenessScorer.score(listOf("Hi there", "Hi there", "Different"))
        assertEquals(3, result.total)
        assertEquals(1, result.uniqueCount)
        assertEquals(listOf(0, 1), result.duplicateIndices)
        assertTrue(result.hasWarning)
    }

    @Test
    fun `matches the client's example - 200 messages 194 unique 6 exact duplicates`() {
        val messages = (1..194).map { "unique-$it" } + List(6) { "duplicate text" }
        val result = UniquenessScorer.score(messages)
        assertEquals(200, result.total)
        assertEquals(194, result.uniqueCount)
        assertEquals(97, result.uniquePercent)
        assertEquals(6, result.duplicateIndices.size)
    }

    @Test
    fun `empty campaign scores cleanly`() {
        val result = UniquenessScorer.score(emptyList())
        assertEquals(0, result.total)
        assertEquals(100, result.uniquePercent)
        assertFalse(result.hasWarning)
    }
}
