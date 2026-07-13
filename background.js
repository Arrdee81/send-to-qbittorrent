async function getCredentials() {
    const credentials = await browser.storage.local.get(['apiScheme', 'apiHost', 'apiPort', 'apiUsername', 'apiPassword']);
    return {
      username: credentials.apiUsername,
      password: credentials.apiPassword,
      url: `${credentials.apiScheme}://${credentials.apiHost}:${credentials.apiPort}`,
      credentials: credentials
    };
}

async function login() {
    const { username, password, url } = await getCredentials();
    const response = await fetch(`${url}/api/v2/auth/login`, {
      method: "POST",
      body: new URLSearchParams({username, password})
    });
    return response.text();
}

// --- Feedback: a system notification ALWAYS fires (works regardless of which
// tab is active or whether the content script is loaded there); the in-page
// toast is best-effort on top of it. ---
function notifyResult(ok, message) {
  browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-96.png"),
    title: "Send to qBittorrent",
    message: `${ok ? "✅" : "❌"} ${message}`,
  }).catch(() => {});
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs[0]) {
      browser.tabs.sendMessage(tabs[0].id, { action: "qbResult", ok, message }).catch(() => {});
    }
  }).catch(() => {});
}

// --- Infohash: the only reliable success signal. qBit's /torrents/add returns
// HTTP 200 for nearly everything (duplicates, even non-torrent payloads), so we
// derive the torrent's v1 infohash and ask qBit whether it's actually present. ---

// base32 (RFC 4648) -> hex, for 32-char btih magnets.
function base32ToHex(b32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of b32.toUpperCase()) {
    const v = alphabet.indexOf(c);
    if (v < 0) return null;
    bits += v.toString(2).padStart(5, "0");
  }
  let hex = "";
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    hex += parseInt(bits.slice(i, i + 8), 2).toString(16).padStart(2, "0");
  }
  return hex.toLowerCase();
}

function magnetHash(uri) {
  const m = uri.match(/xt=urn:btih:([0-9a-zA-Z]+)/);
  if (!m) return null;
  const h = m[1];
  if (h.length === 40) return h.toLowerCase();
  if (h.length === 32) return base32ToHex(h);
  return null;
}

// Walk a bencoded .torrent (Uint8Array) and return the [start,end) byte range
// of the top-level "info" value, so we can SHA-1 exactly those bytes.
// Throws on any malformed input (e.g. an HTML login page) — bounds-guarded so a
// non-bencode payload can never spin the parser. torrentFileHash catches it.
function infoRange(buf) {
  let pos = 0;
  const end = buf.length;
  const td = new TextDecoder("latin1");
  function need(ok) { if (!ok) throw new Error("bad bencode"); }
  function parseString() {
    const n = pos;
    while (pos < end && buf[pos] !== 0x3a) pos++; // ':'
    need(pos < end);
    const len = parseInt(td.decode(buf.subarray(n, pos)), 10);
    need(Number.isFinite(len) && len >= 0 && pos + 1 + len <= end);
    pos++;                                          // skip ':'
    const s = td.decode(buf.subarray(pos, pos + len));
    pos += len;
    return s;
  }
  function parse() {
    need(pos < end);
    const c = buf[pos];
    if (c === 0x64) {                               // 'd' dict
      pos++;
      const entries = [];
      while (pos < end && buf[pos] !== 0x65) {      // 'e'
        const key = parseString();
        const valStart = pos;
        parse();
        entries.push({ key, valStart, valEnd: pos });
      }
      need(pos < end);
      pos++;
      return entries;
    } else if (c === 0x6c) {                        // 'l' list
      pos++;
      while (pos < end && buf[pos] !== 0x65) parse();
      need(pos < end);
      pos++;
    } else if (c === 0x69) {                        // 'i' int
      pos++;
      while (pos < end && buf[pos] !== 0x65) pos++;
      need(pos < end);
      pos++;
    } else {                                        // string
      parseString();
    }
  }
  const top = parse();
  if (!Array.isArray(top)) return null;
  const info = top.find((e) => e.key === "info");
  return info ? [info.valStart, info.valEnd] : null;
}

async function torrentFileHash(blob) {
  try {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const range = infoRange(buf);
    if (!range) return null;
    const digest = await crypto.subtle.digest("SHA-1", buf.subarray(range[0], range[1]));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    return null;                                    // not a valid .torrent
  }
}

// Is this infohash present in qBit right now? (background fetch carries the SID
// cookie set by login() for the qBit origin.)
async function isInQbit(url, hash) {
  try {
    const r = await fetch(`${url}/api/v2/torrents/info?hashes=${hash}`);
    if (!r.ok) return false;
    const arr = await r.json();
    return Array.isArray(arr) && arr.length > 0;
  } catch (e) {
    return false;
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Add, then verify by hash. before/after presence distinguishes
// Added vs Already-present vs Failed. hash===null => can't verify, fall back to
// the HTTP status only (and say so).
async function addAndVerify(url, hash, doAdd) {
  const existedBefore = hash ? await isInQbit(url, hash) : false;
  const resp = await doAdd();
  if (hash) {
    for (let i = 0; i < 5; i++) {                 // qBit can take a beat to register
      if (await isInQbit(url, hash)) {
        notifyResult(true, existedBefore ? "Already in qBittorrent" : "Added to qBittorrent");
        return;
      }
      await sleep(400);
    }
    notifyResult(false, "Not added — qBittorrent has no such torrent");
    return;
  }
  // No hash to check against: best we can do is the HTTP status.
  if (resp && resp.ok) notifyResult(true, "Sent (unverified)");
  else notifyResult(false, `qBittorrent rejected it (${resp ? resp.status : "no response"})`);
}

async function addTorrent(urls, credentials) {
    const { url } = credentials;
    try {
      const hash = magnetHash(urls);
      await addAndVerify(url, hash, () =>
        fetch(`${url}/api/v2/torrents/add`, {
          method: "POST",
          body: new URLSearchParams({ urls }),
        })
      );
    } catch (e) {
      console.error("Send to qBittorrent: add failed", e);
      notifyResult(false, "Can't reach qBittorrent");
    }
}

async function openQbit() {
  const { url } = await getCredentials();
  const newTab = await browser.tabs.create({ url: url });
  return newTab.id;
}

async function regularLogin(tabId) {
  const { username, password } = await getCredentials();
  await browser.tabs.executeScript(tabId, {
    code: `
      if (document.getElementById('loginform')) {
        document.getElementById('username').value = '${username}';
        document.getElementById('password').value = '${password}';
        document.getElementById('loginButton').click();
      }
    `
    });
}

async function createContextMenu() {
  await browser.contextMenus.removeAll()
  browser.contextMenus.create(
  {
    id: "sendToQbit",
    title: "Send to qBittorrent",
    contexts: ["link"],
  });
}

browser.runtime.onStartup.addListener(() => {
  createContextMenu();
});

browser.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "sendToQbit") {
    if (info.linkUrl && info.linkUrl.startsWith("magnet:")) {
      // Magnets can't be fetched — hand the URI to qBittorrent directly.
      const credentials = await getCredentials();
      await login();
      addTorrent(info.linkUrl, credentials);
    } else {
      // http(s) .torrent link: fetch it with the page's cookies and upload the
      // file, so login/passkey-gated links work (qBit fetching the bare URL
      // itself would fail — the legacy addTorrent(urls=) path).
      sendUrlToQbit(info.linkUrl);
    }
  }
});

browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local" && changes.magnetLink) {
    const credentials = await getCredentials();
    await login();
    addTorrent(changes.magnetLink.newValue, credentials)
  }
});

let loginTabs = new Set();
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === 'disableCSRF') {
    const tabId = await openQbit();
    await regularLogin();
    loginTabs.add(tabId);
  }
  if (message.action === "openQbit") {
    const response = await login();
    const tabId = await openQbit();
    if (response !== 'Ok.') {
      await regularLogin(tabId)
    }
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && loginTabs.has(tabId)) {
    setTimeout(() => {
      browser.tabs.executeScript(tabId, {
        code: `
          if (document.getElementById('preferencesButton')) {
            document.getElementById('preferencesButton').click();
            setTimeout(() => {document.getElementById('PrefWebUILink').click();}, 500);
            setTimeout(() => {if (document.getElementById('csrf_protection_checkbox').checked) {document.getElementById('csrf_protection_checkbox').click();}}, 500);
            setTimeout(() => {document.querySelector('input[type="button"][value="Save"]').click();}, 500);
          }
        `
      });
    }, 500);
    loginTabs.delete(tabId);
  }
});

// --- Intercept .torrent responses (incl. JS-image buttons / extensionless
// /download/ links) BEFORE they hit disk, and route them to qBittorrent. ---
function looksLikeTorrent(details) {
  const h = details.responseHeaders || [];
  const get = (n) => (h.find((x) => x.name.toLowerCase() === n) || {}).value || "";
  const ct = get("content-type").toLowerCase();
  const cd = get("content-disposition").toLowerCase();
  return ct.includes("application/x-bittorrent")
      || /\.torrent(\?|$)/i.test(details.url)
      || /\.torrent\b/.test(cd);
}

async function addTorrentFile(blob, credentials) {
  const { url } = credentials;
  const form = new FormData();
  form.append("torrents", blob, "download.torrent");
  return fetch(`${url}/api/v2/torrents/add`, { method: "POST", body: form });
}

async function sendUrlToQbit(torrentUrl) {
  try {
    const credentials = await getCredentials();
    const { url } = credentials;
    // Attempt login for the SID cookie, but don't gate on it — qBit may have
    // auth-bypass for localhost/whitelisted IPs, where login returns "Fails."
    // yet the add still lands. Presence-by-hash is the real success test.
    await login();
    // Refetch with the page's cookies so private-tracker passkeys survive,
    // then upload the actual file (MV2 background fetch = no CORS).
    const res = await fetch(torrentUrl, { credentials: "include" });
    const blob = await res.blob();
    const hash = await torrentFileHash(blob);   // null if not a valid .torrent (e.g. an HTML login page)
    await addAndVerify(url, hash, () => addTorrentFile(blob, credentials));
  } catch (e) {
    console.error("Send to qBittorrent: send failed", e);
    notifyResult(false, "Can't reach qBittorrent");
  }
}

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return {};        // ignore our own background fetch
    if (!looksLikeTorrent(details)) return {};
    console.log("Send to qBittorrent: intercepting", details.url);
    sendUrlToQbit(details.url);
    return { cancel: true };                  // stop it from downloading to disk
  },
  { urls: ["<all_urls>"] },
  ["blocking", "responseHeaders"]
);
