# WA Group Adder

A Chrome/Edge (Manifest V3) side-panel extension that **bulk-adds contacts from a
CSV / VCF / TXT file into one of your WhatsApp groups**, with a group picker,
status-coded results, and conservative anti-ban pacing.

It's the companion to **WA Bulk Merge** (the bulk sender) and shares its
architecture: a side panel UI, a content script driving WhatsApp Web, and all
state in `chrome.storage.local`.

---

## Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this `whatsapp-group-adder` folder.
4. Pin the extension and click its icon to open the side panel.
5. Open **WhatsApp Web** and log in (scan the QR). The status pill turns green.

---

## How to use

1. **Import contacts** — drop a `.csv`, `.vcf`, or `.txt`.
   - CSV: pick the **phone** column (and optionally a **name** column).
   - Numbers without a country code default to **+254 (Kenya)**. The preview shows
     the final `+254…` number so you can catch mistakes before anything runs.
2. **Fetch my groups** and pick the target group. You must be an **admin**.
3. Review **Speed & anti-ban safety** (defaults are intentionally slow).
4. **Start adding.** Watch live progress; download a CSV report at the end.

---

## The two things WhatsApp forces on you

**1. You can't add everyone.** Each person's *"Who can add me to groups"* privacy
setting decides. If it's not "Everyone", WhatsApp **refuses the direct add** and
that person shows up in the **✉ need invite** bucket — you follow up with them
manually (send the group invite link). This is a WhatsApp rule, not a bug.

**2. This is the most ban-prone WhatsApp action.** Non-consensual mass adds get
numbers reported and banned fast. The conservative defaults (small batches, long
randomized delays, a daily cap, warm-up, and stop-on-repeated-failures) exist to
protect your number. Only add people who expect to join.

### Result buckets

| Bucket | Meaning |
| --- | --- |
| ✓ added | Successfully added to the group |
| ✉ need invite | Their privacy blocks direct add — send them the invite link |
| • already in | Already a member, skipped |
| ✕ failed | Not on WhatsApp / error / throttled |
| – skipped | Invalid or missing number in the file |

---

## How it works (two add paths)

- **Fast lane (`content/wa-store.js`, MAIN world):** talks to WhatsApp Web's
  internal group API and returns a precise status code per number. Also powers
  the group list. This is best-effort — WhatsApp obfuscates and changes these
  internals often.
- **DOM fallback (`content/content.js`):** if the fast lane can't initialize, the
  extension automates the group-info **Add member** UI. In this mode the target
  group must be the **currently open chat** in WhatsApp Web, and it must stay open
  while adding.

The add loop lives in the content script (group-adding has no deep link to
navigate to, unlike the bulk sender). It survives page reloads by re-reading the
running job from storage, so you can **pause / resume / stop** and it resumes
where it left off — including honoring the daily cap across sessions.

## Anti-ban settings

| Setting | Default | Notes |
| --- | --- | --- |
| Min / Max delay | 45 / 90 s | Randomized wait between each add |
| Pause every N adds | 5 | Batch size before a long cooldown |
| Long pause | 420 s (7 min) | Cooldown after each batch |
| Daily cap | 45 | Persists across sessions; pauses when hit |
| Stop after N fails | 3 | Consecutive failures → auto-pause (throttle warning) |

## Files

```
manifest.json            MV3 config (side panel, MAIN + ISOLATED content scripts)
background.js            Tab orchestration, group fetch relay, job start
content/wa-store.js      MAIN world: WhatsApp internal API bridge (fast lane)
content/content.js       ISOLATED world: add loop, pacing, DOM fallback
lib/parse.js             CSV/VCF/TXT parsing + +254 phone normalization
lib/csv.js               RFC-4180-ish CSV parser (shared with the sender)
sidepanel/               UI: import → group → pacing → run + live progress
```

## Troubleshooting

- **Group list empty / "fast list unavailable":** WhatsApp changed its internals.
  Open the target group in WhatsApp Web, click **Fetch** again — it'll use the
  open chat as the target (DOM fallback mode).
- **Everything fails immediately:** you may not be admin, or WhatsApp is
  throttling. The tool auto-pauses after 3 failures in a row — wait and resume.
- **Adds stop at the cap:** that's the daily cap doing its job. Resume tomorrow.
- **Selectors broke after a WhatsApp update:** see `SELECTORS` in
  `content/content.js` and the module probes in `content/wa-store.js`.

> Use responsibly. Automating WhatsApp Web may violate WhatsApp's Terms and can
> get your number banned.
