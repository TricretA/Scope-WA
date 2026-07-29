# MEMORY.md

Running project state. Update this every session — see `CLAUDE.md`'s memory
discipline section. This is not a changelog (that's `CHANGELOG.md`); it's
"what's true right now and why."

## Current phase

**Phase 0 — done.** Project skeleton, CI, git repo, and governance docs are
in place. No phase-1-through-7 work has started yet.

Next up: Phases 1 (Accessibility Service), 2 (Contacts), and 3 (Templates)
can all start in parallel — see `docs/BUILD-PLAN.md` for scope and file
ownership per phase. Phase 1 needs a physical Android device and is the long
pole; start it first even though it doesn't block 2 or 3.

## Key decisions on record

- **Separate app, not a v2 of the existing SMS/M-Pesa app.** Different risk
  profile (Accessibility Service permission, WhatsApp UI churn) and must
  never take down the money-handling app. See architecture doc section 4.
- **Accessibility Service, not WhatsApp Web/WebView.** Uses the real number
  already logged in, no QR pairing/expiry, works with both WhatsApp and
  WhatsApp Business. See architecture doc section 5.1.
- **Direct-install signed APK via GitHub Releases, not Play Store.**
  Accessibility + bulk messaging would be rejected outright.
- **Extraction is export-only — never writes to the phone's contacts app.**
  Explicit client instruction (architecture doc section 10, Q8).
- **Build order is deliberate: extractor → sender → adder.** Risk increases
  in that order; each phase teaches the Accessibility techniques the next
  needs. Group adder (Phase 7) ships last on purpose.
- **Repo/branch structure:** `main` (releasable) ← `features` (integration)
  ← per-phase branches. Enforced in `CLAUDE.md`. Initial scaffold commit
  went directly to `main`, as a one-time exception before the policy applied.

## Open questions (from architecture doc section 10, some already answered by the client)

All answered as of the architecture doc's writing (2026-07-29):
1. Both WhatsApp and WhatsApp Business must be supported.
2. Client will use a dedicated second number for campaigns.
3. Up to 20k total contacts; target ≤5,000 reached per day.
4. Runs on a dedicated phone (Samsung/Techno available), untouched during a campaign.
5. Real message example is in architecture doc section 10, Q5 — use it as the
   template test fixture rather than inventing a new one.
6. Attachments needed: images, video, audio, documents, optionally captioned.
7. 150+ groups, 700+ members each — extraction needs to handle that scale
   (pagination/scroll performance matters).
8. Extracted contacts are exported as CSV only, never saved to the phonebook.

Nothing outstanding from the client as of Phase 0. If a later phase surfaces
a new open question, add it here with the date it came up.

## Known risks to keep front of mind

- Ban risk is reduced, not eliminated, at any volume — this must stay
  visible in the product (see architecture doc section 2), not just in docs.
- WhatsApp UI changes are a "when," not "if" — that's what
  `accessibility/WaSelectors.kt` centralizing selectors is for.
- WhatsApp's LID rollout hides some group members' numbers; how many is
  per-group and unknowable until Phase 4 extraction runs against the
  client's actual groups.

## Environment notes

- No local JDK/Gradle/Android SDK detected on this machine as of 2026-07-29
  — all builds currently go through GitHub Actions CI. If a future session
  finds local tooling installed, this note is stale; remove it.
- `gh` CLI is authenticated as `TricretA` locally.
