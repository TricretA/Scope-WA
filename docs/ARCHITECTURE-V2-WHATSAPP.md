# Scope WA — Version 2 Architecture (plain English)

> **What this document is:** everything the client sent, understood, plus the
> design for the WhatsApp app. Written to be read once and understood — no
> jargon walls. Deep technical bits are boxed off and kept short.
>
> **Date:** 2026-07-29 · **Status:** design proposal, nothing built yet.

---

## 1. What the client actually asked for

Three jobs, all on WhatsApp, all on his phone:

| # | The job | His words, translated |
| --- | --- | --- |
| **A** | **Bulk send** | "I have many customers on WhatsApp. Let me message them all, but make each message look hand-typed so WhatsApp doesn't flag me." |
| **B** | **Extract group contacts** | "Pull the numbers out of my WhatsApp groups and save them to my phone — I'm tired of Google Forms that only 40% fill in." |
| **C** | **Bulk add to group** | "People say 'just add me' instead of clicking my group link. Adding one by one is too slow." |

And one condition on all three:

> **"I know it's risky. Reduce the ban chance as much as humanly possible."**

That condition is not a footnote — **it is the product.** Anybody can write a
loop that sends 500 messages. What he's paying for is the part that keeps his
number alive while it does.

---

## 2. Honest risk statement (put this in front of him before anything is built)

| Feature | Ban risk | Why |
| --- | --- | --- |
| Bulk sending | **Medium–High** | Risk comes almost entirely from *people blocking/reporting him*, not from the sending itself. |
| Extracting group contacts | **Low** | Reading only. Nothing leaves the phone, nothing is sent. |
| **Bulk adding to groups** | **Very High** | This is the single most-punished action on WhatsApp. Adding strangers gets numbers banned fastest. |

**What actually triggers WhatsApp bans** (this is what we design against):

1. **Block rate** — how many recipients hit "Block". Biggest signal by far.
2. **Report rate** — "Report spam".
3. **Identical text** sent to many people in a short window.
4. **Bursts** — many messages in minutes, especially to people who never messaged him.
5. **Cold number** — a number that has never done volume suddenly doing volume.
6. **Mass group adds** of people who didn't ask.

Notice that **1, 2 and 6 are about human reaction**, not about code. No amount
of clever engineering fixes messaging people who don't want it. The app can
make him *look* human; it cannot make strangers *want* his messages.

### The one recommendation he should hear first

> **Use a second number for campaigns. Not the main business line.**

A dedicated campaign number means a ban costs him a SIM card, not his
business. The app should support this natively (it drives whichever WhatsApp /
WhatsApp Business is installed). This is worth more than every anti-ban
feature in section 6 combined.

---

## 3. What he sent us, and what we take from it

### 3.1 Screenshots (renamed — `USE` / `REF` / `SKIP` in each filename)

| File | What it shows | Verdict |
| --- | --- | --- |
| `01-…campaign-dashboard-…-REF` | Auto Text task list, Pending / Done / Failed tabs | **REF** — copy the 3-tab idea for campaign status |
| `02-…recipient-lists-with-counts-USE` | Saved lists: "Fifth 824", "B. GROUP 4…8", "Waitlist" | **USE** — this is exactly our Contact Lists screen |
| `03-…contact-picker-824-selected-USE` | "824 selected" bulk-tick contact picker | **USE** — bulk select/deselect UX |
| `04-…new-list-form-USE` | New List: name + purpose + add recipients | **USE** — our list creation screen |
| `05-…new-template-dialog-REF` | Bare "Enter message" box | **REF** — ours will be far better (variables + spintax) |
| `06-…settings-bulk-delays-…-USE` | **The important one.** "Bulk WhatsApp: delay between messages — 20 seconds", Auto-Unlock Device, Dual WhatsApp Accounts, WA Business support | **USE** — proves the approach and shows the settings he already understands |
| `07-…channel-picker-…-REF` | SMS / WhatsApp / WA Business / Telegram / Email | **REF** — we only do WhatsApp + WA Business |
| `08-…whatsapp-compose-screen-USE` | Title, Send To, Message, attachment + variable buttons, Schedule | **USE** — our campaign composer |
| `09-…schedule-when-to-send-USE` | Right now / 15 min / 1 hour / tomorrow / pick date | **USE** — campaigns should be schedulable |
| `10-…repeat-recurrence-SKIP` | Hourly/daily/weekly repeat | **SKIP** — recurring blasts = fast ban |
| `11-…variables-reference-…-USE` | `{NAME}`, `{FIRST_NAME}`, `{LAST_NAME}`, `{DATE}`, `{RANDOM_NUMBER}`… | **USE** — our variable system, extended with CSV columns |
| `12-…auto-reply-sms-rule-SKIP` | SMS auto-reply rules | **SKIP** — v1 already does this, better |
| `13-…forward-sms-SKIP` | SMS forwarding | **SKIP** — not asked for |
| `14-bizpromo-grab-group-numbers-…-USE` | **The other important one.** "Click Start → it opens WhatsApp → open group info → scroll → come back → you have all contacts" | **USE** — this literally describes the Android technique we'll use |
| `15-bizpromo-b2b-leads-gmaps-SKIP` | Google Maps business scraper | **SKIP** — different product entirely |

### 3.2 The three Chrome extensions

These already work on his laptop. They are **proven blueprints** — we are not
inventing behaviour, we are porting it to Android.

| Extension | What it does | What we reuse |
| --- | --- | --- |
| **whatsapp-bulk-sender** | CSV → `{{column}}` template → sends one by one with random 8–20s delays, long pause every 25, pause/resume/stop, CSV report | Template engine, pacing model, campaign state machine, result report |
| **whatsapp-contact-extractor** | Lists your groups, pulls members, dedupes across groups, filters (exclude admins / exclude saved / hide-privacy), exports CSV/XLSX/VCF/TXT/JSON | Group listing, dedupe-across-groups, the filter set, VCF export (that's what saves to the phonebook) |
| **whatsapp-group-adder** | CSV/VCF/TXT → adds to a group. Defaults: **45–90s** between adds, pause every **5**, **7-minute** cooldown, **45/day** cap, auto-stop after **3** failures. Buckets results as added / needs-invite / already-in / failed | The entire pacing philosophy, the result buckets, the daily cap that survives restarts |

**Three things their READMEs already learned the hard way — we inherit them:**

1. **Some numbers can never be added.** WhatsApp's *"Who can add me to groups"*
   privacy setting blocks it. Those people must fall into a **"send invite link"**
   bucket, not a "failed" bucket. This is a WhatsApp rule, not a bug we can fix.
2. **Some numbers are now hidden.** WhatsApp is rolling out LID identifiers that
   hide members' phone numbers in groups. Those members get exported as `hidden`
   so counts stay honest. **How many are hidden depends entirely on his groups —
   could be none, could be most.** He must be told this before he pays.
3. **WhatsApp changes its layout constantly.** Both extensions keep all their
   fragile bits in one `SELECTORS` block for exactly this reason. Our app must do
   the same — see section 8.

---

## 4. Should it be a separate app? **Yes.**

He suggested it, and he's right. Reasons:

| Reason | Detail |
| --- | --- |
| **Protects the money app** | v1 auto-replies to real M-Pesa payments. That must never break because a WhatsApp feature crashed. |
| **Very different permissions** | v2 needs an **Accessibility Service** — an invasive, scary permission. Keeping it out of the SMS app is right. |
| **Different risk** | If WhatsApp bans or breaks something, v1 keeps earning. |
| **Different release speed** | v2 will need frequent fixes when WhatsApp changes its UI. v1 should stay stable. |

**But we clone v1's proven skeleton**, because it already works and is battle-tested:

- Kotlin + Jetpack Compose
- Room database
- GitHub Actions CI (no local Android Studio — same as v1)
- Signed release APK + `update.json` + in-app updater
- Direct install, **not** Play Store (Accessibility + bulk messaging would be
  rejected instantly — this is not even a debate, and v1 already learned the
  Play Store lesson the hard way)

**Working name:** `Scope WA` — package `com.tricreta.scopewa`.

---

## 5. How it works technically (the part that matters)

### 5.1 The core question: how do you automate WhatsApp on a phone?

There's no official API for a personal WhatsApp account. Meta's Business Cloud
API exists but is useless here — it needs business verification, only sends
Meta-pre-approved templates, charges per conversation, and **cannot read group
members or add people to groups at all.**

So the app has to drive the **real WhatsApp app already installed on his phone.**
Two ways:

| Approach | How | Verdict |
| --- | --- | --- |
| **A. Accessibility Service** ⭐ | Android lets an app read what's on screen and tap things — the feature built for blind users. The app opens WhatsApp, reads the screen, taps buttons. **This is exactly what BizPromo does in screenshot 14.** | **CHOSEN** |
| B. Hidden WhatsApp Web in a WebView | Bundle a browser inside the app, pair it as a "linked device", run the same code as his Chrome extensions | Rejected — needs QR pairing, linked devices get logged out, and WhatsApp actively detects unofficial clients |

**Why A wins:**

- Uses his real number, already logged in. No QR, no pairing, no expiry.
- Works with **both** WhatsApp and WhatsApp Business (his old app supported both — see screenshots 6 and 14).
- It's the same technique as the app he already used and trusted.
- No server, no monthly cost, no per-message fee. Everything on the phone.
- Slower — but **slow is the whole point.** We *want* long delays.

**The trade-offs, stated honestly:**

- The phone is busy while a campaign runs (screen on, WhatsApp in front).
  *This is why Auto Text has an "Auto-Unlock Device" setting.* We need the same.
- WhatsApp changes its screens → things break → we ship a fix. Expect this
  a few times a year. It is maintenance, not failure.
- Accessibility permission has to be turned on manually in Android Settings.
  One-time, but it needs a guided walkthrough screen.

<details>
<summary><b>Technical detail — skip unless you want it</b></summary>

The Accessibility Service receives `AccessibilityEvent`s and can walk the
active window's `AccessibilityNodeInfo` tree — the same tree a screen reader
uses. From it we can find nodes by view-id, text, or content-description, and
issue `ACTION_CLICK`, `ACTION_SET_TEXT`, `ACTION_SCROLL_FORWARD`, or synthetic
gestures via `dispatchGesture`.

Sending one message = open `https://wa.me/<intl>?text=<urlencoded>` via an
`Intent` targeted at the WhatsApp package (this is a documented WhatsApp deep
link, it prefills the compose box), wait for the send button node, click it,
verify the compose box cleared, then hand back to the scheduler.

Extracting a group = open group info, scroll the participant `RecyclerView`,
read each row's title + subtitle, dedupe by phone, stop when scrolling yields
no new rows.

Adding to a group = group info → Add participants → type the number into the
search field → wait for the result row → click → repeat up to the batch size →
confirm. Read the resulting toast/dialog text to classify the outcome.

Every WhatsApp-specific string, view-id and content-description lives in **one
file** (`whatsapp/WaSelectors.kt`), with ordered fallbacks — exactly like the
extensions' `SELECTORS` object, and for the same reason.
</details>

### 5.2 Shape of the app

```
   ┌──────────────────────────────────────────────┐
   │  UI  (Compose)                               │
   │  Contacts · Templates · Campaigns · Groups   │
   │  Settings · Activity log                     │
   └────────────────────┬─────────────────────────┘
                        │
   ┌────────────────────▼─────────────────────────┐
   │  BRAIN  (pure Kotlin — unit tested in CI)    │
   │  • Template engine (variables + spintax)     │
   │  • Uniqueness scorer                         │
   │  • Pacing planner (delays, batches, caps)    │
   │  • Phone normaliser (+254 default)           │
   │  • Safety rules / circuit breakers           │
   └────────────────────┬─────────────────────────┘
                        │
   ┌────────────────────▼─────────────────────────┐
   │  JOB RUNNER  (foreground service)            │
   │  Takes the next step, waits, survives        │
   │  reboots, resumes where it stopped           │
   └────────────────────┬─────────────────────────┘
                        │
   ┌────────────────────▼─────────────────────────┐
   │  HANDS  (Accessibility Service)              │
   │  Actually taps WhatsApp                      │
   │  ← all fragile selectors live here           │
   └──────────────────────────────────────────────┘
                        │
   ┌────────────────────▼─────────────────────────┐
   │  Room DB  (everything stays on the phone)    │
   └──────────────────────────────────────────────┘
```

**Why split this way:** the **brain** has no Android code in it, so all the
important logic (does this message look unique? is this delay safe? are we over
the daily cap?) can be **tested in CI without a phone** — same trick that made
v1's parser and rules engine safe to ship blind.

**Why a foreground service here, when v1 forbids them:** v1's rule was about
*SMS detection*, which must be instant and can't afford a service. Here the work
is a long-running, visible, user-started campaign — exactly what a foreground
service is for, and Android will kill anything else mid-campaign.

### 5.3 What we store

| Table | Holds |
| --- | --- |
| `contacts` | number, name, source group, tags, saved?, **opted out?**, last messaged, times replied |
| `contact_lists` | named lists ("Fifth 824", "Waitlist") — screenshot 02 |
| `templates` | message body with variables + spintax |
| `campaigns` | list + template + pacing profile + schedule + status |
| `campaign_messages` | one row per recipient: the exact text sent, status, time, error |
| `group_add_jobs` | target group, source list, daily counter that survives restarts |
| `extractions` | group → members pulled, when |
| `settings` | pacing profiles, active hours, caps, which WhatsApp app |

Everything local. Nothing uploaded anywhere. Same privacy stance as v1.

---

## 6. The anti-ban system — the actual product

Grouped into five layers. Each is independently switchable so he can tune.

### Layer 1 — Make every message genuinely different

| Technique | What it does |
| --- | --- |
| **CSV variables** | `{name}`, `{first_name}`, `{town}`, `{last_bundle}` — any column in his CSV becomes a variable. With fallbacks: `{name\|there}` |
| **Spintax** ⭐ | `{Hi\|Hello\|Habari\|Niaje} {first_name}, {tuko na\|kuna} offer mpya` → every recipient gets a different combination. **This is the single biggest anti-fingerprint lever, and none of his current tools have it.** |
| **Sentence shuffling** | Optional: reorder independent sentences per recipient |
| **Emoji variance** | Randomly include / omit / vary emoji from a small set |
| **Greeting & sign-off pools** | Rotate openers and closers independently |

**Uniqueness meter** — before he presses send, the app shows:

```
   200 messages · 194 unique (97%) · 6 exact duplicates
   ⚠ 6 people would get identical text. Add more spintax options.
```

Exact duplicates across a campaign should **warn loudly**; sending 200 identical
strings is the classic ban pattern.

> ⚠️ **One thing we will NOT do:** invisible/zero-width characters to fake
> uniqueness. It's a known spam-detection signal — it makes things *worse*, not
> better. Real variation only.

### Layer 2 — Behave like a human, not a script

| Setting | Suggested default | Why |
| --- | --- | --- |
| Delay between messages | **random 25–90s** | His extension used 8–20s. Too fast for an unwarmed number. |
| Pause every N messages | **every 12** | Humans take breaks |
| Long pause length | **4–8 minutes, randomised** | Not a fixed number — fixed intervals *are* a fingerprint |
| Typing delay | **proportional to length** | A 300-character message shouldn't appear in 200ms |
| Active hours | **8am – 8pm only** | Nobody hand-types blasts at 3am |
| Daily cap | **starts at 30** | See warm-up below |

**Warm-up ramp** ⭐ — the feature his tools don't have and that matters most for
a fresh number:

| Day | Max messages |
| --- | --- |
| 1–2 | 20 |
| 3–4 | 40 |
| 5–7 | 80 |
| 2nd week | 150 |
| after | 250 (his chosen ceiling) |

The app **enforces** this and refuses to go over. Going from 0 to 500 on day one
is the fastest ban there is.

### Layer 3 — Recipient hygiene (where the real risk lives)

| Rule | Why |
| --- | --- |
| **Saved contacts first** | Messages to saved contacts are dramatically safer than to strangers |
| **People who replied before, first** | Two-way conversation is the strongest positive signal |
| **STOP handling** ⭐ | Anyone who replies "STOP"/"ACHA"/"SITAKI" is permanently excluded. Automatically. |
| **Cooldown per person** | Never message the same person twice within N days |
| **Skip non-WhatsApp numbers** | Every failed lookup is itself a small negative signal |
| **Suppression list** | Numbers he never wants contacted again |

### Layer 4 — Circuit breakers (stop before the damage)

The campaign **auto-pauses** on any of these:

- 3 consecutive failures
- WhatsApp shows any "can't send" / restriction / warning dialog
- Zero replies across a whole batch (a bad sign the list is cold)
- Daily cap reached
- Outside active hours

Pausing is always safe — the job survives and resumes. Never "keep trying".

### Layer 5 — Group adding gets its own, stricter rules

Because it's the highest-risk action:

| Setting | Default |
| --- | --- |
| Batch size | **3** |
| Delay between adds | **60–150s, random** |
| Cooldown between batches | **8–15 min, random** |
| Daily cap | **20** (his extension used 45 — too high for a phone-based add) |
| Stop after failures | **2 in a row** |
| Privacy-blocked people | Auto-moved to a **"send invite link"** list, never retried |

Plus a rule the extension doesn't have: **only offer to add people who have
messaged him before or are in a list he extracted from a group they already
joined.** Adding cold numbers is what gets numbers killed.

---

## 7. The screens

| Screen | What's on it | Modelled on |
| --- | --- | --- |
| **Home** | "Ready to send" state, today's counters, warm-up day, active campaign | — |
| **Contacts** | Lists with counts, import CSV/VCF/TXT, bulk tick, filters, export | Screenshots 02, 03, 04 |
| **Extract** | Pick group(s) → extract → dedupe → filter → **Save to phone (VCF)** / export | Extension + screenshot 14 |
| **Templates** | Message editor with variable chips, spintax editor, live preview cycling through 5 random renders, **uniqueness meter** | Screenshots 05, 11 + new |
| **Campaign** | Pick list → pick template → pacing profile → schedule → preview → **Start** | Screenshots 08, 09 |
| **Running** | Live progress, sent/failed/skipped, current person, next-in countdown, Pause / Resume / Stop | Extension side panel |
| **Group Add** | Pick group → pick list → strict pacing → run → result buckets | Extension |
| **Activity log** | Everything sent, exportable as CSV | v1's log |
| **Settings** | WhatsApp vs WA Business, pacing profiles, active hours, caps, warm-up state, auto-unlock, permissions health | Screenshot 06 |

**Pacing profiles** — instead of making him understand six numbers, give three
presets he picks in one tap:

| Profile | Feel |
| --- | --- |
| 🐢 **Safe** | slowest, tiny batches — new number, or after any warning |
| 🚶 **Normal** ← default | the numbers in section 6 |
| 🏃 **Fast** | shows a red warning before it's allowed on |

---

## 8. Things that will break, and the plan for them

| Problem | Plan |
| --- | --- |
| **WhatsApp changes its UI** | All selectors in one file with ordered fallbacks. A break = a small patch + a release. His v1 in-app updater pattern makes this a 10-minute fix on his side. |
| **Hidden numbers (LID)** | Show them as `hidden` and be upfront about the count. Not fixable by us. |
| **Privacy blocks group add** | "Needs invite" bucket + one-tap invite link. Not a bug. |
| **Phone locks mid-campaign** | Auto-unlock setting (as Auto Text has) + a wake lock + a clear "keep the phone plugged in and on this screen" instruction. |
| **He gets banned anyway** | Be honest that this is possible at any volume. Second number. Export/import of all his lists so a new number starts with his data intact. |

---

## 9. Build order

Each phase ends with green CI and a working APK he can install and try.

| Phase | What | Why this order |
| --- | --- | --- |
| **0** | Project skeleton, CI, signing, updater — cloned from v1 | Reuse what already works |
| **1** | Accessibility service + permission walkthrough + "can I see WhatsApp?" test screen | **Nothing else is possible until this works.** Prove it early on his actual phone. |
| **2** | Contacts: import CSV/VCF/TXT, lists, dedupe, phone normalisation, export | Pure logic, fully CI-testable, zero risk |
| **3** | Templates: variables + spintax + preview + uniqueness meter | Also pure logic. The anti-ban brain. |
| **4** | **Group contact extractor** | Lowest-risk WhatsApp feature — safest place to learn the Accessibility work |
| **5** | **Bulk sender** + full pacing + circuit breakers + live progress | The main event |
| **6** | Save-to-phone (VCF), activity log, reports | Finishing the loop |
| **7** | **Group adder** — strictest settings, ships last | Highest risk. Ships only after everything else is proven. |

**Deliberate:** extractor before sender, sender before adder. Risk goes up in
that order, and each phase teaches us the Accessibility techniques the next one
needs.

---

## 10. Open questions for the client

Answer to these before Phase 1 — they change the design:

1. **Which WhatsApp?** Both business and normal whatsapp.
2. **Second number for campaigns — Yes.
3. **How many contacts total,** He has upto 20k, and wish to reach 5000 or less per day.
4. **Which phone will run this?** He has lots of phones, samsung, Techno. The phone will not be touched during campaign.
5. **What does a real message look like?** {{name}}, this is Skylink. Thanks for signing up for the Data Challange. KIndly find your receipt {{receipt_code}}, and use it before {{date}}. Thanks. Reply STOP to never receive this.
6. **Attachments?** Images, Videos, Audio, Documnets. Or file can be captioned.
7. **How many groups,** 150+ groups with 700 people or more in.
8. **Does he want the extracted contacts saved into the phonebook,** Contacts never saved on phonebook. They are just extracted, cleaned, fomated and saved as csv files.

---

## 11. One-paragraph summary

Build a **separate Android app** that drives the WhatsApp already installed on
his phone, using Android's **Accessibility Service** — the same technique as the
BizPromo app he already used. It does three things: **extract** group members to
a clean contact list, **bulk send** messages that are genuinely different for
every recipient (CSV variables + spintax + a uniqueness meter), and **bulk add**
people to groups. Wrapped around all of it is a **five-layer anti-ban system**:
real message variation, human-like randomised pacing with a warm-up ramp,
recipient hygiene with automatic opt-out, circuit breakers that pause before
damage, and much stricter rules for group adding. Everything stays on the phone.
Distribution is a signed APK via GitHub — same pipeline that already works for
v1. Ban risk is reduced, **not eliminated**, and he should run campaigns from a
second number.
