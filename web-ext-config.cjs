// Packaging rules for `web-ext build` / `web-ext sign`.
// 🚫 NEVER remove CLAUDE.md from ignoreFiles — it is a symlink to the fleet-wide
// homelab reference (hostnames, VLAN subnets, tailnet findings, HARD STOPS).
// web-ext skips dotfiles by default, so .claude/ and .amo-upload-uuid are already
// out; CLAUDE.md is the one non-dot file in this repo that must never ship.
module.exports = {
  ignoreFiles: [
    "CLAUDE.md",
    "web-ext-artifacts",
    "web-ext-config.cjs",
    "PRIVACY.md",
    "AMO-LISTING.md",
  ],
};
