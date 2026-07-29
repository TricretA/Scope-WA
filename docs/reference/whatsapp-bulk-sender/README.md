# WA Bulk Merge — Personalized WhatsApp Web Sender

A Chrome extension (Manifest V3) that sends **personalized** WhatsApp Web text messages
in bulk from a CSV. Each row's columns become `{{variables}}` in your message, with
`{{column|fallback}}` defaults for empty cells. Includes randomized human-like delays,
periodic long pauses, live progress, pause/resume/stop, and a downloadable results
report. (Text only for now — image/file attachments are planned for a later version.)

> ⚠️ **Use responsibly.** Bulk automation can violate WhatsApp's Terms of Service and
> get your number banned — especially for identical messages to people who didn't opt in.
> Personalized messages to your own contacts, sent slowly, are much lower risk. You are
> responsible for how you use this.

---

## Install (unpacked, ~1 minute)

1. Open **`chrome://extensions`** in Chrome (or Edge: `edge://extensions`).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder:
   `whatsapp-bulk-sender`
4. Pin the extension (puzzle-piece icon → pin **WA Bulk Merge**).
5. Click the icon — the **side panel** opens on the right.

## First run

1. In another tab, open **https://web.whatsapp.com** and log in (scan the QR with your
   phone). The pill at the top of the side panel turns green: **"WhatsApp connected"**.
2. In the side panel:
   - **Step 1** — Upload a CSV (drag it in or click). Try `sample-contacts.csv` first.
     The first row must be column headers.
   - **Step 2** — Pick the **phone column**. Numbers need a **country code**
     (e.g. `+1 415 555 1234`). Invalid/short numbers are auto-skipped.
   - **Step 3** — Write your message. Click a column chip to insert it, e.g.
     `Hi {{name|there}}, great to connect with {{company|your team}}!`
     A live preview of contact #1 shows below.
   - **Step 4** — Set delays (defaults are sensible & safe).
   - **Step 5** — **Test (row 1 only)** first, then **Start sending**.

## How to TEST it safely (do this before any real batch)

1. Make a tiny CSV with **1–2 of your OWN numbers**, e.g.:
   ```
   name,phone
   MySelf,+<your full number with country code>
   ```
2. Load it, write a short message like `Test {{name}} ✅`.
3. Make sure the pill says **WhatsApp connected**.
4. Click **Test (row 1 only)** — the extension navigates to that chat, types the message,
   and sends it. Check the phone actually received it.
5. If the test works, load your real CSV and click **Start sending**. Keep the WhatsApp
   tab **open** while it runs. Watch the progress bar, counts, and live log.
6. When done (or anytime), click **Download CSV report** for a per-contact sent/failed log.

Controls while running: **Pause** (finishes the current one, then holds), **Resume**,
**Stop**. You can close the side panel; the campaign keeps running in the WhatsApp tab.

## What "safe pacing" does

- Random delay between each message (default **8–20s**).
- A longer pause (default **150s**) every **25** messages.
- Skips invalid numbers and numbers **not on WhatsApp** (logged as failed, not retried).
- Nothing is sent without a valid, logged-in WhatsApp Web session.

Recommended for 50–300 contacts: keep delays at defaults or higher, and consider
splitting very large lists across days.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Pill stuck on "Open WhatsApp Web" | Click the pill; log in on the WhatsApp tab. |
| Pill says "Scan QR" | Scan the QR with your phone (Linked devices). |
| "chat did not load (timeout)" in log | Slow network, or WhatsApp changed its layout — see **Maintenance**. |
| "number not on WhatsApp" | That number has no WhatsApp account. Expected; it's skipped. |
| Sending silently stops | Make sure the WhatsApp tab stays open and the computer doesn't sleep. |

### Maintenance — when WhatsApp changes its UI
WhatsApp obfuscates and periodically changes its HTML, which can break the automation.
**All the fragile selectors are grouped at the top of
[`content/content.js`](content/content.js) in the `SELECTORS` object** — each is a list
of fallbacks tried in order. If sending breaks:
1. Open `web.whatsapp.com`, press F12 → Console. Reload with a campaign running and read
   the `[WABM]` logs — they say which step failed (compose box / send button).
2. Right-click the relevant element → Inspect, and add a working CSS selector to the
   matching list in `SELECTORS`.
3. Reload the extension at `chrome://extensions`.

---

## Project layout

```
whatsapp-bulk-sender/
├── manifest.json            # MV3 config, permissions, side panel + content script
├── background.js            # tab detection, connection status, campaign kickoff
├── sidepanel/
│   ├── sidepanel.html/.css  # the control-room UI
│   └── sidepanel.js         # CSV → template → pacing → run + live progress
├── content/
│   └── content.js           # WhatsApp automation engine (SELECTORS live here)
├── lib/
│   ├── csv.js               # dependency-free CSV parser
│   └── template.js          # {{var|fallback}} engine
├── icons/                   # 16/48/128 png
└── sample-contacts.csv      # demo data
```

## Known limitations (v1)

- **Text only** for now — image/file attachments are planned for a later version.
- Newlines in messages are inserted via the editor; very complex formatting may vary.
- Success = "message submitted to the chat"; it does not read delivery/read receipts.
- Deep-link navigation reloads the WhatsApp tab per contact (this is intentional — it's
  the most reliable path and the reload time doubles as natural pacing).
