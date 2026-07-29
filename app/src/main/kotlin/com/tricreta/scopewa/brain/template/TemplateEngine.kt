package com.tricreta.scopewa.brain.template

/**
 * Renders a message template against one recipient's variables.
 * See architecture doc section 6, layer 1.
 *
 * A `{...}` block is one of:
 *  - a bare variable: `{first_name}`
 *  - a variable with a fallback chain: `{name|there}` — uses the CSV value if
 *    non-blank, otherwise walks the fallbacks in order, otherwise uses the
 *    literal text of the last fallback.
 *  - spintax: `{Hi|Hello|Habari|Niaje}` — no segment matches a known variable
 *    key, so one option is picked at random for this recipient.
 *
 * Variable keys are matched case-insensitively against the CSV column names.
 */
class TemplateEngine(private val random: () -> Double = Math::random) {

    private val blockPattern = Regex("\\{([^{}]*)}")

    fun render(template: String, variables: Map<String, String>): String {
        val lowerVariables = variables.mapKeys { it.key.trim().lowercase() }
        return blockPattern.replace(template) { match ->
            resolveBlock(match.groupValues[1], lowerVariables)
        }
    }

    private fun resolveBlock(rawBlock: String, variables: Map<String, String>): String {
        val segments = rawBlock.split("|").map { it.trim() }
        if (segments.isEmpty() || segments.all { it.isEmpty() }) return ""

        val firstKey = segments.first().lowercase()

        return when {
            segments.size == 1 -> variables[firstKey] ?: "{${segments[0]}}"
            variables.containsKey(firstKey) -> {
                val value = variables[firstKey]
                if (!value.isNullOrBlank()) value else resolveFallbackChain(segments.drop(1), variables)
            }
            else -> segments[pickIndex(segments.size)]
        }
    }

    private fun resolveFallbackChain(fallbacks: List<String>, variables: Map<String, String>): String {
        for (fallback in fallbacks) {
            val asVariable = variables[fallback.lowercase()]
            if (!asVariable.isNullOrBlank()) return asVariable
        }
        return fallbacks.lastOrNull().orEmpty()
    }

    private fun pickIndex(size: Int): Int = (random() * size).toInt().coerceIn(0, size - 1)
}
