# Scope WA — Build Plan

This is the punch list for turning the Phase 0 skeleton into the app
described in [`ARCHITECTURE-V2-WHATSAPP.md`](ARCHITECTURE-V2-WHATSAPP.md).
It exists so **different Claude sessions can each own a phase and work in
parallel** without stepping on each other's files.

## Before you start (every session, every phase)

1. Read [`CLAUDE.md`](../CLAUDE.md) — branch policy is not optional.
2. Read [`MEMORY.md`](../MEMORY.md) for current project state; it may have
   moved since this file was last touched.
3. Branch off `features` (never off `main`), name the branch after your
   phase, e.g. `phase-2-contacts`.
4. Only touch the files listed under **Owns** for your phase. If you need to
   touch a shared file (see *Shared hotspots* below), keep the change small
   and call it out clearly in the PR description.
5. Before opening a PR into `features`: unit tests pass, CI is green, and you
   have added an entry to `CHANGELOG.md` under `[Unreleased]` and updated the
   relevant section of `MEMORY.md`.

## Status snapshot

**Phase 0 — done** (this session, 2026-07-29). Project skeleton, Gradle
config, CI (`ci.yml`) + release pipeline (`release.yml`), package structure,
and the following pure-Kotlin `brain/` pieces are already implemented **and
unit tested** — reuse them, don't reimplement:

- `brain/phone/PhoneNormalizer.kt` — E.164 normalisation, default +254
- `brain/template/TemplateEngine.kt` — CSV variables + fallback chains + spintax
- `brain/uniqueness/UniquenessScorer.kt` — the uniqueness-meter math
- `brain/pacing/WarmUpRamp.kt` — the day→cap ramp table
- `brain/pacing/PacingPlanner.kt` — Safe/Normal/Fast profiles, randomised delays
- `brain/safety/CircuitBreaker.kt` — the five auto-pause conditions

Everything else below is unbuilt.

## Dependency graph

```
Phase 0 (done)
  ├─ Phase 1  Accessibility Service          ─┐
  ├─ Phase 2  Contacts                        ├─▶ Phase 4  Group Extractor  ─┐
  └─ Phase 3  Templates                      ─┘                              │
                                                                              ├─▶ Phase 7  Group Adder
      Phase 1 + Phase 2 + Phase 3 ────────────▶ Phase 5  Bulk Sender ───────▶│
                                                     │                       │
                                     Phase 2 + Phase 5 ─▶ Phase 6  Activity Log / Reports
```

**Phases 1, 2, and 3 can start today, in parallel, in three separate
sessions.** Everything else has a real dependency and should wait.

Phase 1 is the long pole — it needs a physical Android device with WhatsApp
installed and can't be fully verified by CI. Start it first even though it
isn't strictly blocking 2 or 3.

## Shared hotspots (coordinate before touching)

- **`data/db/ScopeWaDatabase.kt`** — the `@Database(entities = [...])` list is
  a single file every data-owning phase wants to add to. Whoever lands
  first (recommend: Phase 2) should scaffold **all eight entities** from
  architecture doc section 5.3 (`contacts`, `contact_lists`, `templates`,
  `campaigns`, `campaign_messages`, `group_add_jobs`, `extractions`,
  `settings`) even if most start as minimal/empty shells. Later phases then
  only add fields and DAOs to their own entity, not new `@Database` entries.
- **`accessibility/WaSelectors.kt`** — every phase that automates a new
  WhatsApp screen (1, 4, 5, 7) appends to this file. Append, don't
  restructure, and note in the PR which app (`com.whatsapp` vs
  `com.whatsapp.w4b`) and which WhatsApp version the selectors were captured
  against.
- **`AndroidManifest.xml`** — only touch if your phase adds a new permission
  or component; keep the diff minimal.

---

## Phase 1 — Accessibility Service + permission walkthrough

**Depends on:** Phase 0. **Blocks:** 4, 5, 7.
**Owns:** `accessibility/**`, `ui/settings/**`, wiring into `ui/home/HomeScreen.kt`.

Build:
- A guided walkthrough (`ui/settings/`) that deep-links to Android's
  Accessibility settings, explains what's being granted and why (the
  permission is scary — see architecture doc section 5.1), and reflects
  live connection state via `WaAccessibilityService.isConnected`.
- Fill in `WaSelectors.kt` with real view-ids/content-descriptions for the
  compose box and send button, for **both** `com.whatsapp` and
  `com.whatsapp.w4b` — this requires a real device.
- A "can I see WhatsApp?" test screen: opens WhatsApp via the `wa.me` deep
  link, confirms the service can read the compose box node.

**Acceptance:** works on a real phone (Samsung and Techno, per the client's
answer in section 10 Q4, if available); CI green; PR description states
exactly what was verified on-device vs. only compiled.

**Reference:** architecture doc sections 5.1, 5.2, 9 (Phase 1).

---

## Phase 2 — Contacts

**Depends on:** Phase 0 only. **Blocks:** 4, 5, 6, 7.
**Owns:** `data/db/**` (scaffold *all* entities — see hotspots above),
`data/repository/contacts/**`, `ui/contacts/**`.

Build:
- Room schema per architecture doc section 5.3.
- CSV/VCF/TXT import — port the parsing approach from
  `docs/reference/whatsapp-group-adder/lib/parse.js` and
  `docs/reference/whatsapp-contact-extractor/lib/exporters.js` to Kotlin.
- Dedupe using the existing `PhoneNormalizer`.
- Lists screen + bulk-select contact picker (screenshots 02, 03, 04) + CSV export.
- `opted_out` flag and suppression list (needed by Phase 5's STOP handling).

**Acceptance:** unit tests for import/dedupe/normalise; Room compiles; CI green.

**Reference:** architecture doc sections 3.2, 5.3, 7; screenshots 02/03/04.

---

## Phase 3 — Templates

**Depends on:** Phase 0 only (reuse `TemplateEngine` and `UniquenessScorer`
as-is — don't reimplement). **Blocks:** 5.
**Owns:** `ui/templates/**`, `TemplateEntity` + its DAO only (don't touch
other entities in `ScopeWaDatabase.kt`).

Build:
- Template editor with variable chips + spintax editor.
- Live preview that cycles through 5 random renders via `TemplateEngine`.
- Uniqueness meter UI backed by `UniquenessScorer`, matching the
  "200 messages · 194 unique (97%) · 6 exact duplicates" format from
  architecture doc section 6.

**Acceptance:** CI green; manual click-through showing preview cycling and
the uniqueness warning firing on a template with too little variation.

**Reference:** architecture doc section 6 layer 1, section 7, screenshots 05/11.

---

## Phase 4 — Group contact extractor

**Depends on:** Phase 1, Phase 2. **Blocks:** 7.
**Owns:** `ui/extract/**`, `ExtractionEntity` + DAO, extraction routines in
`accessibility/` (appends to `WaSelectors.kt`).

Build: group listing → open group info → scroll participant list → dedupe
across groups → filters (exclude admins / exclude saved / hide-privacy) →
export CSV/XLSX/VCF/TXT/JSON. Handle WhatsApp's LID hidden-number rollout
honestly (export as `hidden`, show the count). Per the client's answer in
section 10 Q8: **never write to the phone's contacts app** — export only.

**Acceptance:** manual device test extracting a real group's members;
unit tests for dedupe-across-groups and filter logic.

**Reference:** architecture doc sections 3.2, 5.1, 10 (Q7/Q8).

---

## Phase 5 — Bulk sender

**Depends on:** Phases 1, 2, 3. **Blocks:** 6, 7 (indirectly).
**Owns:** `ui/campaign/**`, `ui/running/**`, `jobrunner/CampaignJobService.kt`
(real implementation), `CampaignEntity`/`CampaignMessageEntity` + DAOs,
send routine in `accessibility/`.

Build: campaign composer (list + template + pacing profile + schedule +
preview + Start), live progress screen (pause/resume/stop), and the actual
wiring of `PacingPlanner` + `WarmUpRamp` + `CircuitBreaker` +
`UniquenessScorer` + `TemplateEngine` inside the foreground service. Plus:
STOP/ACHA/SITAKI opt-out handling, per-person cooldown, saved-contacts-first
and replied-before-first ordering.

**Acceptance:** manual device test sending to a small set of real test
numbers with visibly randomised pacing; CI green; existing brain-layer unit
tests still pass unmodified.

**Reference:** architecture doc section 5.1 (send routine), section 6
(layers 1–4), section 7 (screenshots 08/09), section 10 Q5 (real message example).

---

## Phase 6 — Save-to-phone, activity log, reports

**Depends on:** Phase 2, Phase 5.
**Owns:** `ui/activitylog/**`, report/export code reusing Phase 2's CSV export.

Build: activity log (everything sent, exportable CSV) and campaign result
reports.

**Acceptance:** CI green; exported file opens correctly in a spreadsheet app.

---

## Phase 7 — Group adder

**Depends on:** Phases 1, 2, 4. Ships last, deliberately.
**Owns:** `ui/groupadd/**`, `GroupAddJobEntity` + DAO, add-to-group routine
in `accessibility/`, jobrunner extension.

Build: strict pacing (batch size 3, 60–150s delay, 8–15min cooldown between
batches, daily cap 20, stop after 2 consecutive failures), a
"needs invite link" bucket for privacy-blocked numbers that is never
retried, and the hard rule from section 6 layer 5: **only offer to add
people who messaged before, or came from a group they already belong to** —
never cold numbers.

**Acceptance:** manual device test against a disposable test group with
test numbers only — never the client's real groups without explicit
consent, and say so loudly in the PR; unit tests for pacing/cap/bucket logic.

**Reference:** architecture doc section 6 layer 5, section 3.2, section 8.
