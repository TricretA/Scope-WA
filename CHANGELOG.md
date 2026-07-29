# Changelog

All notable changes to this project are documented here. One entry per
merged PR, newest first within each release. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

Nothing merged into `features` yet — Phase 0 landed directly on `main` (see
`CLAUDE.md` for why that was a one-time exception).

## [0.1.0] — 2026-07-29 — Phase 0: project skeleton

Initial scaffold, committed directly to `main` during project setup.

### Added
- Android project skeleton: Kotlin + Jetpack Compose + Room, Gradle version
  catalog, `com.tricreta.scopewa` package structure matching the layered
  design (`ui/`, `brain/`, `jobrunner/`, `accessibility/`, `data/`, `update/`).
- GitHub Actions CI (`ci.yml`): unit tests + debug build on every push to
  `main`/`features` and every PR into `main`.
- GitHub Actions release pipeline (`release.yml`): signed release APK +
  `update.json`, published to GitHub Releases (gated on signing secrets
  being configured).
- `brain/` pure-Kotlin logic, fully unit tested:
  - `PhoneNormalizer` — E.164 normalisation, default country +254.
  - `TemplateEngine` — CSV variable substitution with fallback chains, plus
    spintax (`{a|b|c}`), matching architecture doc section 6.
  - `UniquenessScorer` — the uniqueness-meter math from section 6.
  - `WarmUpRamp` — the day→daily-cap ramp table from section 6.
  - `PacingPlanner` — Safe/Normal/Fast pacing profiles with randomised delays.
  - `CircuitBreaker` — the five auto-pause conditions from section 6, layer 4.
- Accessibility Service and foreground-service scaffolding
  (`WaAccessibilityService`, `CampaignJobService`, `WaSelectors`) — connection
  plumbing only, no automation logic yet (that's Phase 1).
- In-app updater (`UpdateChecker`) reading the `update.json` shape the
  release pipeline publishes.
- `docs/ARCHITECTURE-V2-WHATSAPP.md` — the full design doc, preserved from
  the client-supplied scratch folder.
- `docs/reference/` — the three proven Chrome-extension blueprints
  (bulk sender, contact extractor, group adder) and the client's annotated
  screenshots, preserved before the original scratch folder is deleted.
- `docs/BUILD-PLAN.md` — phase-by-phase build plan with file ownership and
  dependency graph, so later phases can be worked in parallel by separate
  sessions.
- `CLAUDE.md`, `MEMORY.md` — project governance and running state.
- Private GitHub repository at `TricretA/Scope-WA`, with `main` and
  `features` branches.

### Fixed
- `TemplateEngine` decided variable-vs-spintax by whether the value map
  happened to contain the key for a given recipient, so a known-but-blank
  variable could randomly resolve as spintax — caught by CI failing on the
  first push (flaky `TemplateEngineTest`). Now decided by an explicit
  `knownVariableNames` set (the CSV headers) instead of the per-row map.

### Notes
- No Room entities yet — `data/` is intentionally empty past a README until
  Phase 2 designs the schema against real requirements.
- No UI screens beyond placeholders (`ComingSoonScreen`) — real screens land
  with their owning phase.
- Not yet buildable end-to-end on a local machine without a JDK/Android SDK
  install; CI is the source of truth until a contributor sets up local tooling.
