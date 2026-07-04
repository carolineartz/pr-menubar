# PR Menubar

macOS menubar app for monitoring GitHub PRs. The popover answers one question: **what should I do next on my PRs?**

Every PR gets a computed next action — `FIX CI` / `MERGE` / `ADDRESS` / `REVIEW` / `RESUME` / `WAITING` — that drives the action chips, sort order, tray badge count, and notifications. Includes a noisy-checks rule so flaky reporters (e.g. `codecov/*`) never page you.

Built with Electron (Tray + vibrancy popover) · React · TypeScript · electron-vite. Design handoff and reference prototype live in [design/](design/HANDOFF.md).

## Screenshots

*Captured from the app itself on its mock dataset (`PRMB_MOCK=1 PRMB_SHOOT=1 electron out/main/index.js` regenerates these). The native vibrancy blur doesn't survive capture — panels look flat here.*

| My PRs — expanded CI breakdown (dark) | Reviewing — grouped by what to do (light) |
|---|---|
| ![My PRs, dark](docs/screenshots/my-prs-dark.png) | ![Reviewing, light](docs/screenshots/reviewing-light.png) |

| Team — person toggles (light) | All — every open PR, newest first (dark) |
|---|---|
| ![Team, light](docs/screenshots/team-light.png) | ![All, dark](docs/screenshots/all-dark.png) |

## Requirements

- macOS, [mise](https://mise.jdx.dev) (pins Node + pnpm via `mise.toml`)
- [GitHub CLI](https://cli.github.com) authenticated: `gh auth login` — the app reuses `gh auth token`

## Develop

```sh
pnpm install
pnpm dev        # run against live GitHub data
pnpm dev:mock   # run against the design-prototype mock dataset (no network)
pnpm test       # vitest unit tests (next-action, noisy checks, notifications)
```

## Build

```sh
pnpm build:mac  # unsigned local .app in dist/
```
