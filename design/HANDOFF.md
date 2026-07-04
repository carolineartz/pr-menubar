# Handoff: PR Menubar — macOS menubar app for monitoring GitHub PRs

## Overview
A macOS menubar app (Electron) whose popover answers one question: **what should I do next on my PRs?** It shows PR lists + CI status only — no issues, no dependabot. Core mechanic: every PR gets a computed "next action" (FIX CI / MERGE / ADDRESS / REVIEW / RESUME / WAITING) that drives chips, sort order, the tray badge, and notifications.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to ship. The task is to **recreate these designs in an Electron + macOS environment**. No codebase exists yet; recommended stack: Electron (Tray + frameless BrowserWindow popover) with whatever renderer stack you prefer (React recommended, matching the prototype's component structure). The `.dc.html` files run in a proprietary design runtime; open them in a browser via the design tool, or treat the inline markup/logic as the reference.

## Fidelity
**High-fidelity.** `PR Menubar Prototype.dc.html` is the source of truth for layout, colors, typography, spacing, and interaction. Recreate it pixel-perfectly. The macOS **vibrancy** look is native: use `BrowserWindow` `vibrancy: 'menu'` / `visualEffectState: 'active'` rather than recreating the blur in CSS. The wallpaper + fake menubar in the prototype are demo chrome — do not build them.

## Product decisions (settled with the user)
- **Auth:** reuse GitHub CLI (`gh auth token`). If unavailable, show a single setup screen with the command to run.
- **Repos:** user-configured list (starts with 2). Poll every 60s closed, refresh on open, manual ⌘R.
- **Tabs (in order): My PRs · Reviewing · Team · Saved · All.**
  - My PRs: PRs I authored in watched repos.
  - Reviewing: review requested from me OR I already reviewed/commented and it's still open. Grouped: START REVIEW / CONTINUE REVIEW / WAITING FOR AUTHOR.
  - Team: PRs authored by a hand-picked set of usernames (NOT filtered by my involvement). A pill row at the bottom of this tab toggles individual people in/out on the fly (toggles affect Team only). Master list in Settings.
  - Saved: manually starred PRs from any tab.
  - All: every watched PR in one feed, sorted by next-action urgency, but **action chips are hidden here** — only review-status pills show.
- **No in-app merge** (cut from v1). MERGE chip rows just open GitHub.
- **No "Done" action, no focus/triage mode** (cut from v1).
- **Snooze:** menu with three options — 1 hour / until tomorrow / until activity. "Activity" = new commit, review, comment, or CI state change. Snoozed rows hide from all tabs (Saved included in hiding? No — they hide everywhere except they remain starred); footer shows "N snoozed · show/hide" to reveal them (revealed rows at 55% opacity with an Unsnooze button).
- **Drafts:** GitHub draft PRs show the draft-PR glyph before the title, muted title color, and "Draft ·" prefix in the meta line.
- **Tray badge:** count of PRs where the next action is MINE (FIXCI/MERGE/ADDRESS/REVIEW/RESUME on My PRs + Reviewing only — never Team/All), excluding snoozed. No badge at zero. Toggleable in Settings.

## Next-action computation (first match wins)
1. **FIX CI** — my PR, a *meaningful* check failed (see noisy-checks below)
2. **MERGE** — my PR, approved, checks green, no conflicts
3. **ADDRESS** — my PR: changes requested, unresolved review threads, or merge conflicts
4. **REVIEW** — review requested from me, not started
5. **RESUME** — I have a pending (unsubmitted) review draft (GitHub API review state `PENDING`), OR I commented without submitting, OR my last review predates the newest commit
6. **WAITING** — everything else (waiting on reviewers, CI running, draft)

## The noisy-checks rule (critical — user's #1 requirement)
Settings holds a list of noisy check-name patterns (e.g. `codecov/*`), global or per-repo.
- A noisy check's failure **never** triggers FIX CI, a red dot, or a notification **while other checks are still running**.
- When all non-noisy checks complete green: PR is treated green; a still-failing noisy check appears in the expanded breakdown marked "ignored · noisy" but doesn't change the dot. If the noisy check is the *only* failure at completion → amber dot, not red.
- Non-noisy failures report immediately, even mid-run.

**CI dot colors:** green = meaningful checks pass · red = meaningful failure · amber = running, or only-noisy failure · dashed/hollow amber ring = queued · gray = no checks.

## Notifications (macOS, each toggleable)
1. CI fails on my PR — meaningful failures only, on transition only (green/running → failed), never repeated.
2. My PR becomes approved / mergeable.
3. Someone requests my review.
4. New comments on my PRs — batched, max one per PR per 15 min.
Clicking a notification opens the PR in the browser.

## Screens / Views

### Popover (the app)
560px wide, border-radius 14px, 1px border, vibrancy material. Structure top→bottom:
1. **Tab bar** (segmented control): container `background: seg-token`, radius 7, padding 2; segments flex:1, 12px text, active segment gets `segact` background + weight 500 + subtle shadow. Each tab shows a count in 10px mono at 60% opacity.
2. **List** (padding 8px 6px, min-height 200px):
   - **Row** (flex, gap 10, padding 9px 10px, radius 8, hover `hov` token, cursor pointer; click toggles expansion):
     - CI dot: 8px circle (red gets `0 0 0 3px redbg` ring; queued = 2px dashed amber border, transparent fill)
     - Title 13px/500, single line ellipsis (+ optional 12px draft glyph before it)
     - Meta line 11.5px in `txt3`: `repo #num · updated Xm ago` (or review-requested/comment context)
     - Next-action chip: 10.5px mono 600, padding 4px 7px, radius 5 (hidden on All tab)
     - Status pill: 11px/500, padding 3px 7px, radius 99 (Approved / 2 approvals / Changes req. / 0 of 2 reviews / Conflicts)
     - Author avatar: 20px circle, initials 8.5px/600 white on solid color
     - Chevron 12px, rotates 180° when expanded
     - WAITING rows render at 75% opacity; snoozed (when shown) at 55% + Unsnooze button
   - **Expanded panel** (margin 4px 10px 8px 28px, `inset` bg, 1px `insetb` border, radius 8):
     - One line per check: status icon (12px) + name 12px + duration 11px mono; failed rows get `redbg` row background + underlined "View log" link; ignored rows show a gray dash icon + "ignored · noisy"
     - Footer strip (border-top): "N of M passed" + right-aligned buttons: **Re-run failed** (only if failures; `redbg` fill), **Open** (ext-link icon), **branch-name** (mono, copy icon; click copies + toast), **star** (fills #ffd60a when starred), **snooze** (clock icon; opens 150px menu upward: Snooze 1 hour / Until tomorrow / Until activity). All buttons 11px, 1px `btnb` border, radius 6.
   - **Group headers** (Reviewing tab only): 7px colored dot + 10.5px/600 letter-spaced label + mono count chip. START REVIEW #0a84ff, CONTINUE REVIEW #bf5af2, WAITING FOR AUTHOR faint.
   - **Empty states**: centered 12.5px `txt3` text — Saved: "Nothing saved yet — star a PR from any tab." / Team all-off: "No people shown — toggle someone back on below." / else: "All clear — nothing needs you here."
3. **Team pill bar** (Team tab only, above footer, border-top): "SHOWING" label (10px/600 letter-spaced, faint) + one pill per person: 16px avatar + 11px username, radius 99, 1px `btnb` border; active = `seg` bg; toggled-off = 45% opacity. Click toggles.
4. **Footer** (border-top `hair`, padding 8px 14px): green 6px dot + "Synced Ns ago" (11px `txt3`) + optional "N snoozed · show/hide" link · right: "⌘R" (mono, triggers refresh) · "Open GitHub ↗".
5. **Toast**: bottom-center, `rgba(20,20,24,.92)` white 12px, radius 8, ~1.9s. Used for copy/star/snooze/refresh confirmations.

### Settings window (not prototyped — build simply, native macOS style)
Repos to watch · Team usernames · noisy-check patterns · 4 notification toggles · badge on/off · launch at login.

### Setup state (not prototyped)
If `gh auth status` fails: single centered message in the popover with the `gh auth login` command and a "Check again" button.

## Interactions & Behavior
- Row click = expand/collapse (one at a time). Action buttons `stopPropagation`.
- Tab click switches list; snooze menu closes on any tab switch or row toggle.
- Copy branch → clipboard + toast "Copied {branch}".
- Star → toast "Added to / Removed from Saved"; Saved tab count updates live.
- Snooze option → row disappears, toast "Snoozed until …", footer snoozed-count appears.
- ⌘R (and clicking the footer ⌘R) → refresh; "Synced 0s ago" resets and ticks up every second.
- Light/dark follows **system appearance** (the prototype's toggle is demo chrome).
- Hover states throughout use the `hov` token; buttons brighten text to `txt` on hover.

## State Management
- `tab`, `expandedId`, `snoozeMenuId`, `starred: Set<prId>` (persist), `snoozed: Map<prId, until>` (persist), `showSnoozed`, `teamToggles: Map<user, bool>` (session or persisted), `lastSync`.
- PR data: poll GitHub every 60s (closed) / on open / on ⌘R. Suggested APIs: `search/issues` (`is:pr is:open repo:… author:…` / `review-requested:…`), Checks API for per-check status, Reviews API for approval state + `PENDING` drafts, `mergeable` from the PR object.
- Notification engine compares previous→current snapshot; fire only on transitions; respect noisy-check rule and 15-min comment batching.
- Snoozed-until-activity stores the PR's `updated_at`-ish fingerprint (head SHA + review count + comment count + CI state) and clears when it changes.

## Design Tokens
Font: `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`; mono: `ui-monospace, Menlo, monospace`.
Type scale: 13/500 row title · 12 tabs & checks · 11.5 meta · 11 pills/buttons/footer · 10.5 mono chips · 10 counts. Radii: 14 popover · 8 rows/inset · 7 tab container · 6 buttons · 5 chips/segments · 99 pills.

| Token | Dark | Light |
|---|---|---|
| panel | rgba(30,30,36,.68) + blur 44px sat 180% | rgba(249,249,251,.78) + same blur |
| panel border | rgba(255,255,255,.14) | rgba(0,0,0,.09) |
| shadow | 0 24px 70px rgba(0,0,0,.5) | 0 24px 70px rgba(60,50,80,.28) |
| txt / txt2 / txt3 / faint | #fff / 65% / 50% / 35% white | #1d1d1f / #6e6e73 / #86868b / #a1a1a6 |
| hairline | rgba(255,255,255,.1) | rgba(0,0,0,.07) |
| seg / segact | rgba(255,255,255,.09) / .24 | rgba(0,0,0,.06) / #fff |
| row hover / expanded bg | rgba(255,255,255,.07) / .08 | rgba(0,0,0,.045) / .055 |
| inset bg / border | rgba(255,255,255,.05) / .12 | rgba(0,0,0,.03) / .08 |
| red dot / text / bg | #ff453a / #ff9d97 / rgba(255,69,58,.18) | #ff453a / #c2261f / rgba(255,59,48,.1) |
| green dot / text / bg | #30d158 / #63e884 / rgba(48,209,88,.18) | #34c759 / #248a3d / rgba(52,199,89,.14) |
| amber dot / text / bg | #ffd60a / #ffd60a / rgba(255,214,10,.15) | #ff9f0a / #b45309 / rgba(255,159,10,.15) |
| blue (REVIEW) text / bg | #9ecbff / rgba(10,132,255,.25) | #0a58ce / rgba(10,132,255,.12) |
| purple (RESUME) text / bg | #d7b8f7 / rgba(191,90,242,.22) | #7c3aed / rgba(191,90,242,.12) |
| neutral text / bg | 60% white / 10% white | #6e6e73 / rgba(0,0,0,.06) |
| button border / text | rgba(255,255,255,.16) / .7 | rgba(0,0,0,.14) / #515154 |
| menu panel | rgba(50,50,56,.97) | rgba(255,255,255,.98) |

Avatar colors (initials on white text): you #3c7dd6 · others #7c5cd6, #c97a35, #38995c, #cf5878 — assign stable colors by hashing username.

Respect **Reduce Transparency** (System Settings): blur 0, panel alpha .98.

## Assets
No external assets. All icons are inline 16-viewBox stroke SVGs (PR glyph, draft glyph, check, X, spinner arc, dashed queue circle, external-link, copy, star polygon, clock, chevron) — recreate from the prototype markup or substitute Octicons at 10–12px.

## Screenshots
`screenshots/` — captured from the live prototype (note: the vibrancy blur is stripped by the capture tool; panels look flat here but should blur in the real app):
1. `01` dark · My PRs, row #482 expanded (CI breakdown, ignored codecov row, action strip)
2. `02` light · same view
3. `03` light · Reviewing tab (grouped: start/continue/waiting)
4. `04` light · Team tab with person-toggle pill bar
5. `05` dark · All tab (chips hidden, pills only)

## Files
- `PR Menubar Prototype.dc.html` — **the reference implementation**: full interactive popover, both themes, all states and interactions (template = markup, logic class = behavior + all data shapes).
- `PR Menubar Spec.dc.html` — the product spec (printable).
- `PR Menubar Options.dc.html` — earlier explorations, for style context only (turn 1 aesthetics; final direction = macOS vibrancy).
- `doc-page.js` — runtime helper for the spec file only; ignore for implementation.
