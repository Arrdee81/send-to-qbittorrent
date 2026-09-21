# send-to-qbittorrent — Reference

<!-- Repo-specific slice. Shared context, all HARD STOPS, and the master to-do
     list live in the homelab-reference repo (homelab-reference.md). -->

> **Central doc** — `homelab-reference/homelab-reference.md` holds everything shared. This file is only the
> browser extension's state. The qBittorrent side — categories, qui rules #6–#10, the on-add hook — lives in
> `download/download-reference.md`.

## What it is
Firefox **MV2** extension that sends magnet and `.torrent` links to qBittorrent. MV2 because MV3 can't
authenticate to qBit 5.2 (CORS — `download` slice). Fork of `frogmech/send-to-qbittorrent` (GPL-3.0);
`Arrdee81/send-to-qbittorrent` is an independent copy, `fork: false` on GitHub, so GitHub's compare API can't
diff it against upstream. The qBit address and credentials come from `storage.local`, typed into the config
popup per browser — `measured:` 2026-09-21, no URL or IP is hardcoded in any shipped file.

## 🚫 Every add goes through the category picker
`owner-declared:` 2026-09-20 — prompt for a category on **every** send, chosen over a second "(VR)" menu item,
because a forgotten click would silently file a VR torrent into the default path, where Tdarr transcodes it
irreversibly. `background.js` has **three** add entry points and all three call `askCategory()`: the context
menu (`sendToQbit`), the left-click magnet path (`leftclicksend.js` → `storage.onChanged`), and the
`webRequest.onHeadersReceived` interceptor that catches any `.torrent` download in any tab.
🚫 **NEVER add an add path that skips `askCategory()`** — an uncategorised add is claimed by qui #6 as plain
`whisparr` within 60 s. Closing the picker sends nothing (fail closed).
- The picker is an extension popup window (`windows.create`), the pattern Torrent Control uses. An in-page
  picker was rejected because content scripts can't run on AMO, view-source or PDF pages (`source:` MDN), and
  Firefox background pages can't call `prompt()` (bug 1353637).
- **Why interception at `webRequest`:** it cancels `application/x-bittorrent` / `.torrent` responses, refetches
  with the page's cookies and uploads the file — the only way to catch JS-image download buttons and
  extensionless `/download/<id>` links (pussytorrents' button is a JS `<img>`, no anchor), and passkey-gated
  links qBit can't fetch itself. `downloads.onCreated` + cancel loses the race on tiny `.torrent` files.
- Left-click stores `{href, nonce}`: `storage.onChanged` only fires when the value changes, so without the nonce
  re-sending the same magnet after a cancel is a silent no-op.
- `measured:` 2026-09-20, a `whisparr-vr` send kept its category end to end — qBit's on-add hook skips anything
  already categorised.

## 🚫 Packaging — CLAUDE.md must never ship
`CLAUDE.md` is a symlink to the fleet reference. `measured:` 2026-09-20, a plain `web-ext build` packaged it
(19,654 bytes) and the AMO linter still reported 0 errors. `web-ext-config.cjs` `ignoreFiles` drops it, plus
`web-ext-artifacts`, the config itself, `PRIVACY.md` and `AMO-LISTING.md`. 🚫 **NEVER remove `CLAUDE.md` from
that list. Before any sign or submission, run `web-ext build` and `unzip -l` the result.** Fleet rule: spine
PART 2.

## Distribution (AMO)
- **Two AMO records.**
  - Old id `send-to-qbittorrent@arrdee81` (created 2026-06-21) — **unlisted only, stuck at `status:
    incomplete`.** It won't take a first listed version by either route: the Developer Hub offers no "On this
    site" choice, and via the API a `channel=listed` upload validated clean but came out **unlisted** at
    version-create. Signed unlisted builds 1.3.0, 1.4.0, 1.5.0, 1.7.0, 1.8.0 — owner-only downloads
    (`measured:` 404 anonymously). ⚠ It still holds the slug **`qbit-sender`** and the name "Qbit Sender"; the
    rename to `qbit-sender-selfhosted` was throttled out and never applied. Free it in the UI (Edit Listing →
    Add-on URL).
  - New id **`qbit-sender@arrdee81`**, name **Qbit Sender**, 1.9.0 — for a fresh listed submission via *Submit
    a New Add-on → On this site*. ⚠ **Not yet submitted** as of 2026-09-21 (throttle below). A different id is
    a different extension: existing installs won't update to it, and the qBit address and password are
    re-entered once per browser.
- **Listing rules, all `source:` 2026-09-20:** a fork's name must *"clearly distinguish it from the original"*
  (AMO policy); the first listed version of an existing add-on can't go via API — *"due to missing metadata.
  Please submit via the website"*; add-ons created after 2025-11-03 must declare `data_collection_permissions` —
  declared `["authenticationInfo"]`, since the extension POSTs the qBit username and password (declaring
  `none` would be false). License slug `GPL-3.0-only`, AMO's only v3 option. Answer **No** to the build-tools
  question — shipped files are byte-identical to the repo. Form values: `AMO-LISTING.md`; privacy policy:
  `PRIVACY.md`.
- 🔴 **AMO's write throttle is per user and shared with the web form.** `measured:` addons-server
  `throttling.py` — submission **3/min, 10/hour, 24/day**; file upload **6/min, 20/hour, 48/day**; failed
  calls count. On 2026-09-20 API retries locked Chris out of the web form for about an hour. Get the license
  slug right first, validate once, stop at the first 429.
- 🚫 **NEVER `web-ext sign` a build meant for the listed channel** — it consumes that version number on the
  unlisted channel, and numbers are unique across both. Build unsigned; upload the zip.
- **Dry run:** `POST /api/v5/addons/upload/` with `channel=listed` validates without creating anything; only
  `POST …/addon/<id>/versions/` with the upload uuid creates a version (and didn't honour `listed` for the old
  record — above).
- **Unlisted signing** (the self-install route): AMO JWT key and secret from
  `addons.mozilla.org/en-US/developers/addon/api/key/`. `web-ext` reads any option from `$WEB_EXT_*`, so pass
  `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` as env vars, never flags; then `npx web-ext@10.6.0 sign
  --channel=unlisted`.

## Testing
Zen (`zen-browser-bin`, profile `~/.config/zen/zl1chs9s.Default (release)`): `about:debugging#/runtime/this-firefox`
→ Load Temporary Add-on → `manifest.json`; gone when Zen exits, and `xpinstall.signatures.required=false`
does NOT make an unsigned install stick on a release build — permanent installs need a signed XPI. Verify with the torrent's category **and** save
path in qBit, not the notification. ⚠ zen-browser/desktop #9461: clicking a *temporary* extension's toolbar
button crashed Zen 1.14.2b (Flatpak) — unverified on the AUR build.
