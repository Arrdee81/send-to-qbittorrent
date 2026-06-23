(async ()=> {
  // Track the last pointer position for BOTH left- and right-clicks so the
  // toast lands near the cursor regardless of how the send was triggered.
  let lastX = window.innerWidth - 40;
  let lastY = window.innerHeight - 40;
  document.addEventListener("mousedown", (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
  }, true);

  function showToast(message, ok) {
    const existing = document.getElementById("qb-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "qb-toast";
    toast.textContent = `${ok ? "👍" : "👎"} ${message}`;

    Object.assign(toast.style, {
      position: "fixed",
      left: `${lastX + 15}px`,
      top: `${lastY + 15}px`,
      backgroundColor: ok ? "#1b5e20" : "#7f1d1d",
      color: "#fff",
      padding: "6px 10px",
      borderRadius: "5px",
      fontSize: "12px",
      zIndex: 2147483647,
      pointerEvents: "none",
      opacity: 0,
      transition: "opacity 0.3s ease",
      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      userSelect: "none",
    });

    document.body.appendChild(toast);
    getComputedStyle(toast).opacity;
    toast.style.opacity = 1;

    setTimeout(() => {
      toast.style.opacity = 0;
      setTimeout(() => toast.remove(), 300);
    }, ok ? 1200 : 2500);  // hold failures longer so they're not missed.
  }

  // Feedback listener is ALWAYS on — right-click sends need it too.
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "qbResult") {
      showToast(message.message || (message.ok ? "Sent to qBittorrent" : "Send failed"), message.ok);
    } else if (message.action === "torrentAdded") {  // legacy success signal
      showToast("Sent to qBittorrent", true);
    }
  });

  // Left-click-to-send for magnet links (opt-in).
  const { leftClickSend } = await browser.storage.local.get('leftClickSend');
  if (leftClickSend) {
    document.addEventListener("click", (e) => {
      const magnet = e.target.closest('a[href^="magnet:"]');
      if (magnet) {
        e.preventDefault();
        e.stopPropagation();
        browser.storage.local.set({ magnetLink: magnet.href });
      }
    });
  }
})();
