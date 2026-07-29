# Scope WA

Android app (`com.tricreta.scopewa`) that drives the WhatsApp already
installed on the client's phone via Android's Accessibility Service, to
extract group contacts, send genuinely varied bulk messages, and add people
to groups — with a five-layer anti-ban system built in.

Full design and reasoning: [`docs/ARCHITECTURE-V2-WHATSAPP.md`](docs/ARCHITECTURE-V2-WHATSAPP.md).
Read that before changing anything under `brain/`, `accessibility/`, or
`jobrunner/` — the numbers there (delays, caps, warm-up ramp) are the actual
product, not defaults to casually tune.

## Stack

- Kotlin + Jetpack Compose, Room, WorkManager/foreground service
- No server, no cloud dependency — everything stays on the phone
- GitHub Actions CI (no local Android Studio required)
- Signed release APK + `update.json` + in-app updater — direct install, not
  Play Store (see architecture doc section 4 for why)

## Project layout

```
app/src/main/kotlin/com/tricreta/scopewa/
  ui/            Compose screens (Home, Contacts, Extract, Templates, Campaign, ...)
  brain/         Pure Kotlin — template engine, spintax, pacing, warm-up ramp,
                 uniqueness scorer, circuit breakers. No Android imports. Unit
                 tested in app/src/test/kotlin/... — this is where CI catches
                 anti-ban regressions before they reach a phone.
  jobrunner/     Foreground service that steps a campaign forward and survives reboots.
  accessibility/ The "Hands" — WaAccessibilityService + WaSelectors.kt (every
                 fragile WhatsApp view-id/selector lives in one file, on purpose).
  data/          Room database (lands Phase 2 — see the architecture doc's build order).
  update/        In-app updater, reads update.json published by the release workflow.
```

## Build order

Phase 0 (this skeleton) is done. See architecture doc section 9 for phases 1–7
and why they're sequenced that way (extractor before sender, sender before
adder — risk goes up in that order).

## Local build

No Gradle wrapper jar is committed (see `.gitignore` — it's a binary CI can't
usefully diff). Either:

- open the project in Android Studio, which regenerates it automatically, or
- run `gradle wrapper --gradle-version 8.9` once with a local Gradle install.

CI does not need the wrapper — it provisions Gradle directly.

## Governance

- [`CLAUDE.md`](CLAUDE.md) — branch policy and how AI assistants should work in this repo
- [`CHANGELOG.md`](CHANGELOG.md) — history of what shipped
- [`MEMORY.md`](MEMORY.md) — running project memory (decisions, open questions, current state)
