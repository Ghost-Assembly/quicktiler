# Working on QuickTiler

QuickTiler is a GNOME Shell extension: keyboard-driven zone tiling with a
Quick Settings tile, no overlay and no timers. README.md is for people
deciding whether to install it or use it; this file holds the rules for
anyone — human or agent — changing it.

## What gets published

- `just build` produces `quicktiler@napalm255.github.io.shell-extension.zip`.
  A `vX.Y.Z` tag triggers `.github/workflows/release.yml`, which verifies
  version agreement, main ancestry, and successful CI for the exact commit,
  then publishes that tested artifact without rebuilding it.
- Docs at https://ghost-assembly.com/quicktiler/ are deployed by the Pages
  workflow from the tested `docs/` artifact after all required checks pass on main.
- GNOME Extension Store submission and review remain manual.

## Commands

Tool versions live in `mise.toml`; common commands live in the canonical
`justfile`; project-specific commands and hooks live in `project.just`.
Run `just ci` before claiming a change works.

| Command                                                                | Does                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `just setup`                                                           | Install pinned tools, npm development dependencies, and Chromium/Firefox; check host tools      |
| `just fmt`                                                             | Format JavaScript, Python, configuration, and generated documentation                           |
| `just lint`                                                            | Verify canonical files, generated docs, ESLint, Prettier, Ruff, schemas, and shell scripts      |
| `just template-check`                                                  | Compare managed files with the immutable GitHub revision in `quick-template.lock.json`          |
| `just template-sync SHA`                                               | Synchronize a reviewed canonical revision; then install dependencies and regenerate docs        |
| `just test`                                                            | Run Vitest, Python tooling tests, and project offline integration tests                         |
| `just coverage`                                                        | Measure runtime JavaScript and Python tooling, including untested files                         |
| `just test-docs`                                                       | Check docs in Chromium and Firefox, including axe accessibility audits                          |
| `just security`                                                        | Run OSV, source and history secret scans, Trivy, actionlint, and Zizmor                         |
| `just build`                                                           | Build a deterministic runtime-only ZIP with Python's standard library                           |
| `just pack-check`                                                      | Compare every ZIP filename and byte with GNOME's official packer; validate icons                |
| `just test-live`                                                       | Check packaging, then isolated GNOME lifecycle and project integration hooks                    |
| `just run`                                                             | Run GNOME Shell in a development window                                                         |
| `just install` / `enable` / `disable` / `uninstall` / `prefs` / `logs` | Work with the extension in your logged-in session                                               |
| `just docs`                                                            | Serve the static site at localhost:8000                                                         |
| `just ci`                                                              | Run lint, tests, coverage, docs, security, and packaging; GitHub also requires CodeQL and Sonar |
| `just clean`                                                           | Confirm before removing generated build and test output                                         |

Live checks require an installed GNOME Shell and run outside hosted CI.
Complete the manual checklist and test each declared GNOME version before releasing.

## Hard constraints

- The uuid `quicktiler@napalm255.github.io` is fixed. GNOME identifies an
  extension by its uuid; changing it makes GNOME treat it as a different
  extension.
- The gschema keybinding key names are prefixed with `quicktiler-`
  (`quicktiler-tile-left`, `quicktiler-focus-right`, `quicktiler-swap-left`,
  …), the same way quickts prefixes `quickts-open-menu`: Mutter keeps one
  table of keybinding names for the whole Shell and refuses a name already
  claimed by another extension, so an unprefixed `tile-left` is a name a
  second extension could just as easily pick. The schema declares only the
  current action keys; `tests/actions.test.js` checks that they match `ACTIONS`
  exactly.
- Decisions live in the gi-free modules — `zones.js`, `windows.js`,
  `neighbors.js`, `actions.js`, `shortcuts.js`, `accelerator.js`,
  `settings.js` — which import nothing (`gi://` or `resource:///`), so Vitest
  runs them on plain Node. `quicktiler.js` and `panel.js` only read facts off
  Meta/Shell and St/Clutter/PopupMenu/QuickSettings respectively and act on
  what the pure modules decide; `extension.js` only constructs and tears down
  the two of them.
- No JavaScript ships on the docs pages. `just test-docs` fails the build if
  any does.
- Shared tooling comes from the pinned canonical `quick-template` revision.
  Keep local hooks in `project.just` and generated documentation current.

## Tests

Failing test first (RED), then make it pass (GREEN). Layers:

- `tests/*.test.js` — Vitest. The gi-free modules run on plain Node directly;
  `quicktiler.js` and `panel.js` run through stubs (`tests/stubs/gi-*.js`,
  `tests/stubs/shell-*.js`) and the fake Mutter in `tests/support/actors.js`.
- `scripts/headless-check.sh` — boots a throwaway headless GNOME Shell and
  checks that enable/disable/re-enable produces no JS error and no leaked
  signal. Only `just test-live`; hosted CI does not boot an isolated Shell session.
- `tests/docs.spec.js` (shared across the extensions) + `tests/docs.config.js`
  (this repo's title, site URL, repo URL and section list) — Playwright:
  accessibility in both color schemes, no JavaScript, no request to another
  origin, no sideways scroll at 360px.
- `scripts/build.py --check` — the zip `just build` makes against what
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
- Shared template files arrive here as a reviewed sync commit from the
  canonical template; never edit them directly in this repo (see Hard
  constraints and Template files below).

## Template files

`quick-template.lock.json` pins a full commit SHA from
`Ghost-Assembly/quick-template`. `just template-check` compares managed files
with that immutable GitHub archive; a local manifest cannot approve drift.
Change shared tooling in the canonical repository, then run
`just template-sync SHA`, `npm ci --ignore-scripts`, `just docs-generate`, and
`just ci` in this checkout. The weekly freshness check reports newer approved
releases without adopting them automatically.

Project hooks belong in `project.just`, runtime packaging inputs in
`quick-project.json`, documentation identity in `docs/project.json`, and local
styling in `docs/project.css`. Common README and site sections are generated;
keep extension-specific content outside their markers. Lifecycle test scripts
remain specific to the extension.

## Settings keys

`modules/settings.js` is the single source of truth for every schema key that
is not a keybinding (`KEYS.GAP`, `KEYS.SHORTCUTS_ENABLED`,
`KEYS.SHOW_QUICK_SETTINGS`, collected in `ALL_KEYS`). The gschema
(`schemas/org.gnome.shell.extensions.quicktiler.gschema.xml`) and `prefs.js`
both follow it — add or rename a key there first, and `tests/settings.test.js`
checks the gschema agrees. Keybinding key names (`quicktiler-tile-left`,
`quicktiler-focus-right`, …) are not in `modules/settings.js`; they're named
once in `modules/actions.js` (`ACTIONS`, `ACTION_KEYS`) and passed to
`Main.wm.addKeybinding` by `modules/quicktiler.js`, because they need Mutter's
`as` accelerator-array type rather than the plain booleans and integers
`modules/settings.js` and `SettingsWatcher` handle. They're the prefixed names
covered under Hard constraints above.
