package com.tricreta.scopewa.brain.phone

/**
 * Normalises a phone number to E.164-ish `+<country><number>` form.
 * Default country is Kenya (+254) — see architecture doc section 5.2.
 *
 * Rules:
 *  - Strips everything except digits and a leading `+`.
 *  - A number already starting with `+` is trusted as-is (just cleaned).
 *  - A leading local trunk `0` is replaced by the default country code.
 *  - A bare local number (no leading 0 or +) is assumed to already be missing
 *    only the country code and gets it prefixed.
 */
class PhoneNormalizer(private val defaultCountryCode: String = "254") {

    fun normalize(rawNumber: String): NormalizedPhone {
        val trimmed = rawNumber.trim()
        if (trimmed.isEmpty()) return NormalizedPhone.Invalid(rawNumber)

        val hasPlus = trimmed.startsWith("+")
        val digitsOnly = trimmed.filter { it.isDigit() }
        if (digitsOnly.isEmpty()) return NormalizedPhone.Invalid(rawNumber)

        val e164Digits = when {
            hasPlus -> digitsOnly
            digitsOnly.startsWith("0") -> defaultCountryCode + digitsOnly.removePrefix("0")
            digitsOnly.startsWith(defaultCountryCode) -> digitsOnly
            else -> defaultCountryCode + digitsOnly
        }

        if (e164Digits.length < MIN_E164_LENGTH || e164Digits.length > MAX_E164_LENGTH) {
            return NormalizedPhone.Invalid(rawNumber)
        }

        return NormalizedPhone.Valid("+$e164Digits")
    }

    private companion object {
        const val MIN_E164_LENGTH = 8
        const val MAX_E164_LENGTH = 15
    }
}

sealed class NormalizedPhone {
    data class Valid(val e164: String) : NormalizedPhone()
    data class Invalid(val original: String) : NormalizedPhone()
}
