# WA Contact Extractor

A Chrome (MV3) extension that pulls the **member list of any WhatsApp group you're in**
and exports the names + numbers to **CSV, Excel (.xlsx), VCF, TXT or JSON** — so you never
have to send a "please drop your number" form to a group again.

It is **read-only**: it reads member data already loaded in your WhatsApp Web session.
It never adds, removes, or messages anyone.

## Features

- **Fetch your groups** — lists every group you're in, with member count and an `admin` badge.
- **Multi-select + merge** — tick several groups; members are pulled and **deduped across groups**
  into one master list (a person in three groups appears once, with all three group names).
- **Filters** (applied live, no re-extraction):
  - Exclude me
  - Exclude admins / Only admins
  - Exclude saved contacts (great for collecting only *new* numbers)
  - Only members with no saved name
  - Hide privacy-hidden numbers
  - Drop members with no name at all
- **Five export formats:**
  - **CSV** — `Name,Number` (or all details), UTF-8 BOM so Excel shows names correctly
  - **Excel (.xlsx)** — a real workbook, built with a tiny built-in ZIP writer (no external libraries)
  - **VCF** — vCard 3.0, import straight into a phone's contacts
  - **TXT** — one number per line, or `Name: Number`
  - **JSON** — full schema for reuse in your other tools
- **Column choice** — slim `Name + Number`, or all details (role, groups, saved, push name).

## The "hidden number" reality (important)

WhatsApp is rolling out **LID** (linked identifiers) that **hide members' phone numbers**.
When a member's number is hidden, the extension still exports them — with the number shown as
`hidden` — so your member counts stay honest and you can see *who* is unreachable rather than
silently losing them. VCF and "numbers-only" TXT exports skip hidden members (there's no number
to dial or save); every other format keeps them.

How many members are hidden depends entirely on your groups — it may be none, or a large share.

## Install (unpacked)

1. Go to `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this `whatsapp-contact-extractor` folder.
3. Pin the extension and click it to open the side panel.

## Use

1. Open **web.whatsapp.com** and log in (the pill in the panel turns green when connected).
2. Click **Fetch my groups**, then tick the groups you want.
3. Click **Extract selected groups**.
4. Toggle **filters** to shape the list (counts + preview update live).
5. Pick **columns** and a **file name**, then click **CSV / Excel / VCF / TXT / JSON**.

> Tip: if a group shows *"couldn't be read"*, open that group once in WhatsApp Web so its member
> list loads into memory, then extract again.

## How it works

- `content/wa-store.js` runs in the page's **MAIN world** and reads WhatsApp Web's internal
  Store (webpack module extraction, the wa-js/wppconnect technique) to enumerate groups and
  their participants, resolving names from the Contact store.
- `content/content.js` runs in the **ISOLATED world**, detects login state, and relays requests.
- `background.js` finds/opens the WhatsApp tab and relays messages from the side panel.
- `lib/exporters.js` formats records and includes a dependency-free CRC32 + ZIP writer for `.xlsx`
  (the extension's strict CSP blocks external libraries).

WhatsApp obfuscates and renames its internal modules frequently. If extraction stops working,
open the WhatsApp Web console and look for the `[WACE-store]` probe report — the module finders
in `wa-store.js` are heuristic and may need a tweak.

## Responsible use

Only collect and use numbers people have consented to share. Non-consensual harvesting or
messaging can violate privacy laws (GDPR and others) and WhatsApp's Terms, and can get your
number reported and banned. This tool automates WhatsApp Web and may break its Terms — use it
responsibly and lawfully.
