package com.tricreta.scopewa.brain.uniqueness

/**
 * Scores a rendered campaign for exact-duplicate risk — the "uniqueness meter"
 * in architecture doc section 6, layer 1. Sending many identical strings is
 * the classic ban pattern; this never manufactures fake uniqueness (no
 * zero-width characters), it only measures real variation from templates.
 */
object UniquenessScorer {

    fun score(renderedMessages: List<String>): UniquenessResult {
        if (renderedMessages.isEmpty()) {
            return UniquenessResult(total = 0, uniqueCount = 0, duplicateIndices = emptyList())
        }

        // "Unique" means this exact text was sent to nobody else — every
        // recipient sharing a duplicated text counts against uniqueness,
        // matching the "200 messages · 194 unique · 6 exact duplicates"
        // reading in architecture doc section 6, layer 1.
        val occurrenceCounts = renderedMessages.groupingBy { it }.eachCount()
        val duplicateIndices = renderedMessages.indices.filter { index ->
            occurrenceCounts.getValue(renderedMessages[index]) > 1
        }

        return UniquenessResult(
            total = renderedMessages.size,
            uniqueCount = renderedMessages.size - duplicateIndices.size,
            duplicateIndices = duplicateIndices
        )
    }
}

data class UniquenessResult(
    val total: Int,
    val uniqueCount: Int,
    val duplicateIndices: List<Int>
) {
    val uniquePercent: Int
        get() = if (total == 0) 100 else (uniqueCount * 100) / total

    val hasWarning: Boolean
        get() = duplicateIndices.isNotEmpty()
}
