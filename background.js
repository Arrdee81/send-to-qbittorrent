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

// Tell the active tab whether the send landed (drives the 👍/👎 toast).
function notifyResult(ok, message) {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs[0]) browser.tabs.sendMessage(tabs[0].id, { action: "qbResult", ok, message });
  });
}

async function addTorrent(urls, credentials) {
    const { url } = credentials;
    try {
      const response = await fetch(`${url}/api/v2/torrents/add`, {
          method: "POST",
          body: new URLSearchParams({urls}),
      });
      const body = (await response.text()).trim();
      // qBit returns 200 + "Ok." on success; "Fails." or non-200 means it didn't land.
      if (response.ok && body !== "Fails.") {
        notifyResult(true, "Sent to qBittorrent");
      } else {
        notifyResult(false, `qBittorrent rejected it (${response.status})`);
      }
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
    // Attempt login for the SID cookie, but don't gate on it — qBit may have
    // auth-bypass for localhost/whitelisted IPs, where login returns "Fails."
    // yet the add still lands. The add response is the real success test.
    await login();
    // Refetch with the page's cookies so private-tracker passkeys survive,
    // then upload the actual file (MV2 background fetch = no CORS).
    const res = await fetch(torrentUrl, { credentials: "include" });
    const blob = await res.blob();
    const addResp = await addTorrentFile(blob, credentials);
    const body = (await addResp.text()).trim();
    if (addResp.ok && body !== "Fails.") {
      notifyResult(true, "Sent to qBittorrent");
    } else {
      notifyResult(false, `qBittorrent rejected it (${addResp.status})`);
    }
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
