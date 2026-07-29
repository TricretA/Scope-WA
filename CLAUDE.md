# CLAUDE.md

Instructions for any Claude Code session (or other AI assistant) working in
this repository.

**Repository:** https://github.com/TricretA/Scope-WA (private)

## What this project is

An Android app (`com.tricreta.scopewa`) that drives the WhatsApp already
installed on a client's phone via Android's Accessibility Service, to bulk
send messages, extract WhatsApp group contacts, and bulk-add people to
groups — wrapped in a five-layer anti-ban system. Full design:
[`docs/ARCHITECTURE-V2-WHATSAPP.md`](docs/ARCHITECTURE-V2-WHATSAPP.md).

The build is broken into phases so multiple sessions can work in parallel:
[`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md). **Read that before starting any
implementation work** — it tells you which phase to pick up, what files you
own, what's already built, and what depends on what.

## Branch policy — enforced, not optional

- `main` — always releasable. The release workflow (`.github/workflows/release.yml`)
  builds a signed APK off `main`.
- `features` — integration branch. All phase work merges here first.
- Per-phase branches (e.g. `phase-2-contacts`) — branch off `features`, never off `main`.

**Every change goes: `phase branch` → PR into `features` → (once stable)
PR from `features` into `main`.** Nobody pushes directly to `main` except
the repository owner doing a deliberate release merge. Nobody pushes
directly to `features` either — even small fixes go through a branch and a
PR, so CI runs before anything lands.

The one exception: the initial scaffold commit, made directly to `main` by
the owner during project setup, before this policy existed to enforce.
Everything after that follows the rule above.

Before opening any PR:
- CI (`ci.yml`) must be green — unit tests + debug build.
- `CHANGELOG.md` has a new entry under `[Unreleased]` describing what changed and why.
- `MEMORY.md` reflects the new state (phase status, open questions, decisions made).

## Memory and changelog discipline

This repo tracks its own history in two files, separate from `git log`:

- **`MEMORY.md`** — running project state: which phase is active, what's
  decided, what's still open, what broke and why. Update it *every session*,
  not just at the end of a phase. Treat stale entries as bugs — remove or
  correct them rather than letting them accumulate.
- **`CHANGELOG.md`** — one entry per merged PR, under `[Unreleased]` until a
  release cuts a version. This is the human-readable history of what
  shipped; `git log` is the mechanical one.

Every session that writes code must update both before considering the work
done, not just when explicitly asked.

## Working rules specific to this codebase

- **`brain/` has zero Android imports.** If you're tempted to import
  anything from `android.*` there, the code belongs in `jobrunner/` or
  `accessibility/` instead. This is what makes the anti-ban logic unit
  testable in CI without a phone — don't break it.
- **The pacing numbers (delays, caps, warm-up ramp) in `brain/pacing/` are
  the product, not tuning knobs to loosen for convenience.** Any change to
  them needs a reason tied back to `docs/ARCHITECTURE-V2-WHATSAPP.md`
  section 6, not just "campaigns feel slow."
- **Never write extracted WhatsApp contacts to the Android contacts
  provider.** Per the client's explicit answer (architecture doc section 10,
  Q8), extraction is export-only (CSV/VCF/etc. as files) — nothing touches
  the phonebook.
- **All WhatsApp-specific selectors live in `accessibility/WaSelectors.kt`.**
  Never hardcode a view-id or content-description anywhere else — see
  architecture doc section 8 for why (WhatsApp changes its UI regularly).
- **Distribution is a signed APK via GitHub Releases, not the Play Store.**
  Don't add Play Store publishing config; it was rejected as a strategy for
  the reasons in architecture doc section 4.
- Real device testing (anything under `accessibility/`) can't be fully
  verified by CI. Say explicitly in a PR what was tested on-device versus
  only compiled.
