package com.tricreta.scopewa.brain.template

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TemplateEngineTest {

    @Test
    fun `bare variable is substituted`() {
        val engine = TemplateEngine()
        val result = engine.render("Hi {first_name}!", mapOf("first_name" to "Amina"))
        assertEquals("Hi Amina!", result)
    }

    @Test
    fun `missing bare variable is left untouched`() {
        val engine = TemplateEngine()
        val result = engine.render("Hi {first_name}!", emptyMap())
        assertEquals("Hi {first_name}!", result)
    }

    @Test
    fun `variable with fallback uses csv value when present`() {
        val engine = TemplateEngine()
        val result = engine.render("Hi {name|there}", mapOf("name" to "Juma"))
        assertEquals("Hi Juma", result)
    }

    @Test
    fun `variable with fallback uses literal fallback when value is missing`() {
        val engine = TemplateEngine()
        val result = engine.render("Hi {name|there}", emptyMap())
        assertEquals("Hi there", result)
    }

    @Test
    fun `variable with fallback uses literal fallback when value is blank`() {
        val engine = TemplateEngine()
        val result = engine.render("Hi {name|there}", mapOf("name" to "  "))
        assertEquals("Hi there", result)
    }

    @Test
    fun `spintax picks one of the literal options`() {
        val engine = TemplateEngine(random = { 0.0 })
        val result = engine.render("{Hi|Hello|Habari|Niaje} there", emptyMap())
        assertEquals("Hi there", result)
    }

    @Test
    fun `spintax with a different random draw picks a different option`() {
        val engine = TemplateEngine(random = { 0.99 })
        val result = engine.render("{Hi|Hello|Habari|Niaje} there", emptyMap())
        assertEquals("Niaje there", result)
    }

    @Test
    fun `variables and spintax combine in one template`() {
        val engine = TemplateEngine(random = { 0.0 })
        val result = engine.render(
            "{Hi|Hello} {first_name}, {tuko na|kuna} offer mpya",
            mapOf("first_name" to "Amina")
        )
        assertEquals("Hi Amina, tuko na offer mpya", result)
    }

    @Test
    fun `real receipt template from client renders cleanly`() {
        val engine = TemplateEngine()
        val result = engine.render(
            "{name}, this is Skylink. Thanks for signing up for the Data Challenge. " +
                "Kindly find your receipt {receipt_code}, and use it before {date}. " +
                "Thanks. Reply STOP to never receive this.",
            mapOf("name" to "Brian", "receipt_code" to "SKY-4821", "date" to "2026-08-05")
        )
        assertTrue(result.startsWith("Brian, this is Skylink."))
        assertTrue(result.contains("SKY-4821"))
        assertTrue(result.contains("2026-08-05"))
    }
}
