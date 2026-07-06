# Homelab Project — Claude Code Instructions

<!--
  MANAGED FILE — do not edit copies directly.
  Canonical source: homelab-reference/CLAUDE.md. An identical copy is committed to
  every homelab repo. To change the rules: edit the canonical copy in
  homelab-reference, then run homelab-reference/sync-claude-md.sh to propagate the
  change (copy + commit + push) to all repos. Editing a copy directly will be
  overwritten on the next sync.
-->

## Source of truth
The homelab reference is **split**: each repo has its own `.claude/rules/<repo>-reference.md`
slice (auto-loads when you work in that repo), and the cross-cutting **spine** lives in the
`homelab-reference` repo's `homelab-reference.md` — HARD STOPS, hardware/network, conventions,
the DNS cluster, home automation, the master to-do list, load-bearing pins, cross-cutting
lessons, and a repo index.

At the start of any session that touches homelab state: your repo's slice auto-loads — and you
still **READ THE WHOLE FUCKING THING that is the central `homelab-reference.md`** (the spine; it
does NOT auto-load from other repos — reach it via the sibling `homelab-reference` checkout).
Read the slice + spine **as one connected document**: the slice, the conventions, the HARD STOPS,
and the backlog must agree. If they don't, that is a defect you fix, not a fact you repeat (see
Internal Consistency & Safety).

Treat all of it as authoritative-but-verify (Doc-trust rule). If a chat contradicts the doc, the
more recent reality wins — the doc is now stale and must be updated (see Maintenance).

## How you work with me
- Terse conversations only. Get to the point.
- **Context / compaction — was my #1 rule; the mechanism is different in Claude
  Code.** Losing working context to an unannounced compaction is unacceptable. But
  I CANNOT reliably self-report a token % from inside the chat, so the old "warn me
  at 60%" isn't doable that way. Instead: (1) a PreCompact hook fires a loud warning
  before any auto-compaction — ⚠ TODO: not set up yet; (2) you watch the context
  meter in the Claude Code UI; (3) the instant we're deep in load-bearing work I say
  so and we checkpoint state into `homelab-reference.md` BEFORE anything compacts.
  The doc is the memory across compactions — when in doubt, write it down.
- **Research authoritative/current sources BEFORE answering.** Never answer
  homelab / version / current-state questions from memory. Research, then answer.
  If I answer a question, I still expect you to research it. Do NOT "think
  critically" or form a recommendation until you have up-to-date information from
  SIGNIFICANT research — and you can only have that by actually doing the research.
- Foundation first: for any new project, research and present the standard
  accepted architecture before any implementation. No build-as-you-go.
- Short, focused answers. No multi-phase plans, tables, or checklists unless I
  ask. Answer the exact question asked.
- One command at a time (these can be grouped if it's logical). Label every
  command with the host AND shell it runs on. Fully resolve one machine before the
  next. fish ONLY on the CachyOS desktop; bash everywhere else (Unraid, Proxmox
  hosts, LXCs). Use printf, not heredocs, in fish. In Claude Code I run commands
  myself via the Bash tool — that shell is fish on this CachyOS desktop; remote
  hosts run bash over ssh.
- Never call something "done" until verification passes (e.g. `sshd -T`, not
  reading the config back). Never assume prior hardening / prior state is still in
  place — re-verify.
- Before requesting any file that may hold secrets, give me the redaction command
  first. Secrets go in the UI/field, never in chat.
- Git: in Claude Code I can edit repo files and run git directly. Default workflow:
  I make edits locally, show you the diff, and do NOT `commit` or `push` until you
  approve. On approval I run the commit/push myself (or hand you the literal command
  if you'd rather run it). I no longer require the github.com web UI.
- Never suggest destructive or irreversible actions without first inspecting,
  warning me, and giving a backup/rollback path. **This explicitly includes
  automating, scheduling, or putting on a timer anything that can reboot, upgrade,
  rebuild, wipe, delete, or re-IP a host** — scheduling an apply that reboots a box
  is a destructive action by proxy (see Internal Consistency & Safety #3).

## Compose / GitOps non-negotiables
- No `container_name:` — rely on the default `{stack}-{service}-1`.
- No `:latest` or floating tags — pin semver so Renovate can PR updates.
- `name:` in every compose; `env_file:` only (env in
  `/mnt/cache/appdata/environment/*.env`); absolute volume paths under
  `/mnt/cache/appdata/<service>/`.
- prox2 LXC appdata root is `/mnt/appdata/`, not `/mnt/data/`.
- Container/service work → GitOps (compose → commit/push on your approval →
  Dockhand). Host/OS work → Ansible/Semaphore (rolled out; see the `ansible` slice).

## Internal Consistency & Safety (HARD RULES — these override "preserve existing wording")
These exist because a backlog item ("schedule `full_upgrade.yml`") once drifted
out of sync with the architecture ("hypervisors stay human-gated"), and acting on
it as written would have scheduled an unwatched OS-upgrade-and-reboot of the
Proxmox hosts running DNS and HA. I caught it; the doc did not. These rules stop a
repeat.

1. **The doc must be internally consistent — reconcile before you finalize.**
   Before producing any updated `homelab-reference.md`, check EVERY backlog item,
   TODO, and recommendation against the Conventions (hard rules), the architecture
   sections, and the design rationale. If an item conflicts with a hard rule, the
   hard rule wins: rewrite the item to encode the rule.The doc may NEVER contain an action item, TODO, or suggestion
   that contradicts a hard rule or the stated architecture.

2. **Safety constraints live INSIDE the action item, not just in the design prose.**
   Any rule that forbids or gates an action — especially anything that can reboot,
   upgrade, rebuild, wipe, delete, re-IP, or auto-apply/auto-schedule on a host
   (ABOVE ALL the Proxmox hypervisors and the DNS/HA hosts) — must be written into
   the backlog entry it constrains, and tagged so it survives regeneration (e.g.
   **🚫 HUMAN-GATED — NEVER AUTOMATE/SCHEDULE**). A constraint that lives only in a
   "design" section is not enough; the next reader acts off the TODO.

3. **For Proxmox specifically: automate the CHECKS, never the APPLY.**
   `full_upgrade.yml` — and anything that dist-upgrades and/or reboots a host — is
   a manual button-press in a maintenance window, NEVER a scheduled or blind timer.
   Only read-only `--check` drift detection may be scheduled. The same logic
   applies to any hypervisor or DNS/HA host: state-changing applies and reboots
   stay human-gated.

4. **Backlog items are unverified proposals, not approved tasks.** Before starting
   ANY backlog item, restate it in your own words, reconcile it against the
   architecture, and confirm scope with me before acting. Treat the to-do list the
   way you treat facts (Doc-trust rule): an index of what to verify, not ground
   truth to act on blindly.

5. **Anything load-bearing you learn in a session, write into the doc where it will
   be acted on.** The doc is the only memory between sessions. A rule learned in
   chat but not written into the relevant section — especially a rule that gates a
   dangerous action — is a lost rule. Mention-in-chat is not enough; design-section
   only is not enough; it has to be at the point of action.

6. The reference docs must be self-defending against a cold reader, and THIS rule
   stays here in CLAUDE.md, never inside the reference docs. A fresh instance opens
   a slice or the spine with none of the context that makes a danger obvious;
   a task-focused reader acts on the nearest actionable line. So whenever you
   regenerate the spine OR a slice:
   - The central `homelab-reference.md` opens with a "## HARD STOPS" block: the
     handful of never-do actions, each written as imperative + its
     consequence. Hypervisor/Proxmox "never auto-apply, never schedule an
     upgrade or reboot" is first. This block is mandatory; never drop or
     soften it.
   - Every **slice** entry for an action that can reboot, upgrade, rebuild, wipe,
     delete, re-IP, or auto-schedule a host carries its OWN inline 🚫 stop
     at that entry — not a rule stated only in the spine. Someone who opens
     just that slice must hit the stop there.
   - Phrase every stop as imperative + consequence ("NEVER put
     full_upgrade.yml on a timer — it can reboot a hypervisor running DNS
     and HA unwatched"), never as background description ("the apply is
     human-gated").
   - This rule lives in CLAUDE.md (synced to every repo), never in the reference
     docs it guards: a rule that protects the docs cannot live in the artifacts
     rewritten each session by the model it guards against. Keep it here.

**Doc-trust rule:** treat `homelab-reference.md` as an index of what to verify, not
ground truth, for any load-bearing fact OR action item. Tag live-verified facts
with date + method; keep inferences marked ⚠.

## Maintenance (do this without being asked)
At the end of any chat that changed homelab state, update the **right place** — in place,
show me the diff, commit/push on my approval, briefly list what changed:
- a **stack-specific** change (a container, a version-with-reason, a stack quirk or lesson) →
  that repo's `.claude/rules/<repo>-reference.md` slice;
- a **cross-cutting** change (host/network, a convention, a HARD STOP, a backlog item, a
  cross-cutting lesson) → the central `homelab-reference.md` spine;
- a change to **these instructions** (this `CLAUDE.md`) → edit `homelab-reference/CLAUDE.md`
  and run `homelab-reference/sync-claude-md.sh` to propagate to all repos (never hand-edit a copy).

- Keep ⚠ markers honest: flag anything unverified rather than guessing, and only
  drop a ⚠ once the chat has actually confirmed it.
- Keep the "Unfinished / Unconfirmed" backlog current as a living list.
- **The doc preserves load-bearing facts — it is NOT append-only. Accuracy is not
  the test for keeping a line; a true line still gets cut if it's redundant,
  volatile, or not load-bearing.** Correcting wrong/stale/unsafe wording AND pruning
  redundant/volatile/non-load-bearing lines are both REQUIRED, and neither is
  "dropping facts." The facts/history/context you may NOT drop are the load-bearing
  ones: decisions, rationale, safety constraints, durable config. Keep a one-line
  *(was X; corrected because Y)* note only when a fact actually changed — never as a
  running changelog. Preserving incorrect, dangerous, redundant, or useless wording
  verbatim is a bug, not compliance.
- Write what changed 
- Go back through the whole conversation and add anything that is a fact and could
  matter later — and in the same pass remove anything that no longer earns its
  place. Signal-per-line is the goal, not length in either direction. As the chat
  goes on, flag important facts so they're easy to fold in when the file is
  generated.
- **Run a PRUNE pass as a required step, immediately before the Internal
  Consistency pass.** Walk the WHOLE doc and cut every line that is **redundant**
  (stated or derivable elsewhere — keep it once), **volatile** (a live check like
  `docker ps` / `uname -r` / `pveversion` beats a pinned value — leave a pointer,
  UNLESS the version is itself the load-bearing fact (a compatibility floor, a pin
  constraint, or a "too old to do X" reason) — then keep the version WITH the reason
  attached),
  or **non-load-bearing** (drives no decision, action, or constraint). Accuracy is
  not a defense. In the change summary, list what you cut and why — or state that
  nothing qualified and why. A regen that only grew, with no prune pass run, is
  incomplete.
- **Run the Internal Consistency pass (above) as the LAST step before generating
  the file** — reconcile every backlog item against the hard rules and
  architecture, fix any contradiction, note it.
- **Versioning:** one version bump per session/run, not per topic. Don't inflate
  the version mid-session. progression must stay clean and monotonic.
- **Do not edit the central `homelab-reference.md` spine until I tell you.** (Per-repo slices follow the normal edit → diff → approval flow.)
