package com.tricreta.scopewa.brain.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneNormalizerTest {

    private val normalizer = PhoneNormalizer(defaultCountryCode = "254")

    @Test
    fun `leading zero is replaced with default country code`() {
        val result = normalizer.normalize("0712345678")
        assertEquals(NormalizedPhone.Valid("+254712345678"), result)
    }

    @Test
    fun `already international number is kept as is`() {
        val result = normalizer.normalize("+254712345678")
        assertEquals(NormalizedPhone.Valid("+254712345678"), result)
    }

    @Test
    fun `punctuation and spaces are stripped`() {
        val result = normalizer.normalize("+254 (712) 345-678")
        assertEquals(NormalizedPhone.Valid("+254712345678"), result)
    }

    @Test
    fun `bare local number without leading zero gets country code prefixed`() {
        val result = normalizer.normalize("712345678")
        assertEquals(NormalizedPhone.Valid("+254712345678"), result)
    }

    @Test
    fun `blank input is invalid`() {
        val result = normalizer.normalize("   ")
        assertTrue(result is NormalizedPhone.Invalid)
    }

    @Test
    fun `too short a number is invalid`() {
        val result = normalizer.normalize("123")
        assertTrue(result is NormalizedPhone.Invalid)
    }
}
