# Working on QuickTiler

QuickTiler is a GNOME Shell extension: keyboard-driven zone tiling with a
Quick Settings tile, no overlay and no timers. README.md is for people
deciding whether to install it or use it; this file holds the rules for
anyone — human or agent — changing it.

## What gets published

- The installable artifact is `quicktiler@napalm255.github.io.shell-extension.zip`,
  built by `just build` (plain `zip`, not `gnome-extensions pack` — CI has no
  GNOME) and attached to a GitHub release by `.github/workflows/release.yml`
  when a `vX.Y.Z` tag is pushed.
- Docs are published at https://ghost-assembly.com/quicktiler/, served
  straight from `docs/` on `main` (GitHub Pages branch deploy — no build step,
  no Actions workflow for it). Whatever is committed under `docs/` is what a
  visitor sees on the next push to `main`.
- A tag is what triggers a release, not a push to `main`. `release.yml`
  checks the tag against `metadata.json`'s `version-name` and `package.json`'s
  `version` before building anything, and refuses to ship if either disagrees.

## Commands

| Command                                                  | Does                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `just setup`                                             | mise install, npm ci, Playwright browsers, checks system tools exist                              |
| `just fmt`                                               | `prettier --write`, `eslint --fix`                                                                |
| `just lint`                                              | template-check, eslint, prettier --check, gschema, shellcheck                                     |
| `just template-check [--write]`                          | the shared files (`template.list`) against `template.sha256`                                      |
| `just test`                                              | Vitest unit suite, on plain Node                                                                  |
| `just test-docs`                                         | the docs site in Chromium and Firefox: accessibility (axe), no JS, no third-party requests, 360px |
| `just coverage`                                          | the unit suite with a coverage report                                                             |
| `just test-live`                                         | headless Shell smoke test, then the packer check — needs a real GNOME Shell, never runs in CI     |
| `just pack-check`                                        | the built zip against `gnome-extensions pack`                                                     |
| `just security`                                          | osv-scanner, gitleaks, trivy, actionlint, zizmor                                                  |
| `just build`                                             | the installable zip                                                                               |
| `just run`                                               | a Shell in a window, via `mutter-devkit` — needs a real Shell                                     |
| `just install` / `enable` / `disable` / `prefs` / `logs` | try it against your own logged-in Shell                                                           |
| `just ci`                                                | lint, test, test-docs, security, build — run this before claiming anything done                   |
| `just clean`                                             | remove build/test output                                                                          |

## Hard constraints

- The uuid `quicktiler@napalm255.github.io` is fixed. GNOME identifies an
  extension by its uuid; changing it orphans every existing install exactly
  the way the Tiler → QuickTiler rename once did (README's "Upgrading from
  Tiler 0.1.0" is the scar tissue from that).
- The gschema keybinding key names (`tile-left`, `focus-right`, `swap-left`,
  …) are unprefixed on purpose, for compatibility with settings users already
  have. Prefixing them — e.g. to `quicktiler-tile-left` — would silently
  discard every existing user's custom binding on upgrade, because GSettings
  has no rename. That change is backlogged and needs an explicit migration
  (read the old key, write the new one, on first run of the new version), not
  a plain rename.
- Decisions live in the gi-free modules — `zones.js`, `windows.js`,
  `neighbors.js`, `actions.js`, `shortcuts.js`, `accelerator.js`,
  `settings.js` — which import nothing (`gi://` or `resource:///`), so Vitest
  runs them on plain Node. `quicktiler.js` and `panel.js` only read facts off
  Meta/Shell and St/Clutter/PopupMenu/QuickSettings respectively and act on
  what the pure modules decide; `extension.js` only constructs and tears down
  the two of them.
- No JavaScript ships on the docs pages. `just test-docs` fails the build if
  any does.
- The shared template files (everything listed in `template.list`) are
  byte-locked: `just template-check` fails if they drift from
  `template.sha256`. Don't hand-edit them. Project-specific CSS goes in
  `docs/project.css`, project-only `just` recipes would go in `project.just`
  (quicktiler doesn't need one), and this repo's docs sections/URLs live in
  `tests/docs.config.js`.

## Tests

Failing test first (RED), then make it pass (GREEN). Layers:

- `tests/*.test.js` — Vitest. The gi-free modules run on plain Node directly;
  `quicktiler.js` and `panel.js` run through stubs (`tests/stubs/gi-*.js`,
  `tests/stubs/shell-*.js`) and the fake Mutter in `tests/support/actors.js`.
- `scripts/headless-check.sh` — boots a throwaway headless GNOME Shell and
  checks that enable/disable/re-enable produces no JS error and no leaked
  signal. Only `just test-live`; never CI, because CI has no Shell.
- `tests/docs.spec.js` (shared across the extensions) + `tests/docs.config.js`
  (this repo's title, site URL, repo URL and section list) — Playwright:
  accessibility in both color schemes, no JavaScript, no request to another
  origin, no sideways scroll at 360px.
- `scripts/pack-check.sh` — the zip `just build` makes against what
  `gnome-extensions pack` would produce, so the two cannot drift.

## Conventions

- Conventional Commits, squash-merged PRs, GitHub Actions pinned by commit
  SHA, American English spelling.
- Nothing personal in code, tests, fixtures or docs — no real hostnames,
  accounts or secrets.
- These stay in sync with each other and with the code: `README.md`,
  `docs/index.html`, `docs/project.css`, `tests/docs.config.js`,
  `metadata.json`'s `description`, this file, `CLAUDE.md`, `SECURITY.md`.

## Cross-repo duties

- The one-liner — "Keyboard-driven zone tiling with a Quick Settings tile, no
  overlay and no timers." — must read identically in README.md's summary
  line, `metadata.json`'s `description`, the hub repo's card for QuickTiler,
  the ghost-assembly.com profile row, and this repo's GitHub About/homepage.
  Changing what QuickTiler does or how it's pitched means updating all five,
  not just this repo.
- The hub repo's `site.spec.js` and card content need updating alongside any
  change here that changes the one-liner or what's true about QuickTiler.
- Shared template files arrive here as a `chore:` sync commit from the
  canonical template; never edit them directly in this repo (see Hard
  constraints and Template files below).

## Template files

`template.list` names every file this repo shares byte-for-byte with the
other quick* extensions; `template.sha256` is the manifest `just
template-check` verifies them against. Regenerate it with `just
template-check --write` after a legitimate sync, never by hand-editing the
hash. Anything quicktiler needs that the shared files don't cover goes in:

- `docs/project.css` — this repo's additions to the shared `docs/style.css`.
- `project.just` — project-only `just` recipes, imported by the shared
  `justfile`'s `import? 'project.just'` (quicktiler has none today; the
  import silently tolerates that).
- `tests/docs.config.js` — this repo's docs title, site URL, repository URL
  and section list, read by the shared `tests/docs.spec.js`.

A change that should apply to every quick* extension belongs in the shared
template, synced out to each repo as its own `chore:` commit — never patched
into one repo's copy alone.

## Settings keys

`modules/settings.js` is the single source of truth for every schema key that
is not a keybinding (`KEYS.GAP`, `KEYS.SHORTCUTS_ENABLED`,
`KEYS.SHOW_QUICK_SETTINGS`, collected in `ALL_KEYS`). The gschema
(`schemas/org.gnome.shell.extensions.quicktiler.gschema.xml`) and `prefs.js`
both follow it — add or rename a key there first, and `tests/settings.test.js`
checks the gschema agrees. Keybinding key names (`tile-left`, `focus-right`,
…) are not in `modules/settings.js`; they're named once in `modules/actions.js`
(`ACTIONS`, `ACTION_KEYS`) and passed to `Main.wm.addKeybinding` by
`modules/quicktiler.js`, because they need Mutter's `as` accelerator-array
type rather than the plain booleans and integers `modules/settings.js` and
`SettingsWatcher` handle. They're the unprefixed names covered under Hard
constraints above.
