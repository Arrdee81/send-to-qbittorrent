# AMO listing fields — Qbit Sender

Paste-ready values for **Submit a New Add-on → On this site**, uploading
`web-ext-artifacts/qbit_sender-1.9.0.zip` (id `qbit-sender@arrdee81`).

## Name
Qbit Sender

## Add-on URL (slug)
qbit-sender

Currently held by the old unlisted record (`send-to-qbittorrent@arrdee81`). Free it
first: that add-on → Edit Listing → Add-on URL → `qbit-sender-selfhosted`.

## Summary
Send torrent and magnet links straight to your own qBittorrent server, picking the category for every add so nothing lands in the wrong folder.

## Description
Qbit Sender adds torrent and magnet links to a qBittorrent server you run yourself.

Right-click any magnet or .torrent link and choose Send to qBittorrent. A small window asks which qBittorrent category to file it under, read live from your server, with the category's save path shown. Closing that window sends nothing.

Every add is verified by infohash: the extension asks qBittorrent whether the torrent is actually present, rather than trusting the API's reply, and tells you whether it was added, already there, or failed.

Optionally, left-clicking a magnet link sends it, and .torrent downloads are intercepted and routed to qBittorrent instead of your disk.

You supply your own server address and credentials in the extension's settings. Nothing is hardcoded and nothing is sent to the developer.

A fork of Send to qBittorrent by frogmech, GPL-3.0.

## Category
Download Management

## License
GNU General Public License v3.0 only  (AMO slug: `GPL-3.0-only` — the only v3 option offered)

## Support
- Homepage: https://github.com/Arrdee81/send-to-qbittorrent
- Support site: https://github.com/Arrdee81/send-to-qbittorrent/issues

## Privacy policy
Qbit Sender does not collect, store, or transmit any data to the developer or to any third party. There is no analytics, no telemetry, and no remote logging.

What the extension handles:

- qBittorrent credentials. The username and password you enter in the extension's settings are stored locally in the browser (storage.local) and are sent only to the qBittorrent Web UI address you configured, in order to log in.
- Torrent and magnet links. When you choose to send a link, that link — or the .torrent file it points to — is sent to the same qBittorrent server, along with the category you pick.

Where it goes: only to the qBittorrent server whose address you entered yourself. The developer operates no server and receives nothing. If that server is on your own machine or network, no data leaves it.

Retention and removal: nothing is retained outside your browser. Removing the extension deletes the stored settings and credentials with it.

## Notes for Reviewers
Fork of "Send to qBittorrent" by frogmech (GPL-3.0), renamed and substantially changed: adds a category picker shown before every add, SHA-1 infohash verification that the torrent actually reached the server, interception of .torrent downloads, and left-click magnet sending. background.js is roughly 4x the size of the original (3,845 -> 15,625 bytes) and picker.html / picker.js are new files that do not exist upstream.

Testing requires a qBittorrent instance with the Web UI enabled. The server address and credentials are supplied by the user in the extension's own settings — no server is hardcoded and nothing is sent to the developer. The declared data_collection_permissions value "authenticationInfo" covers the user's own qBittorrent username and password being POSTed to that user-configured server.
