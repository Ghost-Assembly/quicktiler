# Tiler

Keyboard-driven zone tiling for GNOME Shell.

Press a direction repeatedly and the focused window cycles through the zones on
that side. There is no overlay, no grid picker and no panel button — between
keypresses the extension creates no actors, runs no timers and connects to no
global signals, so it costs nothing at all.

## Zones

Both common ultrawide layouts — `1/4 + 1/2 + 1/4` and `1/2 + 1/2` — are
span-merges of the same four-column grid, so Tiler has no notion of a "current
layout" to switch between. It has one flat list of zones and three cycles:

| Key         | Cycles through                                            |
| ----------- | --------------------------------------------------------- |
| Tile left   | left quarter → left half                                  |
| Tile right  | right quarter → right half                                |
| Tile centre | centre half → centre top third → centre bottom two thirds |

The centre thirds exist for the common arrangement of a video call above a
terminal.

Which zone a window is in is read back from its own geometry on every keypress.
Nothing is remembered, so cycling works on windows that some other tool placed,
and there is no state to go stale.

## Shortcuts

Every default was checked against the shortcuts GNOME 50 binds out of the box,
so none of them collide and you do not have to unbind anything.

| Action               | Default                                                        |
| -------------------- | -------------------------------------------------------------- |
| Tile left            | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>←</kbd>                  |
| Tile right           | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>→</kbd>                  |
| Tile centre          | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>↑</kbd>                  |
| Maximize             | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>↓</kbd>                  |
| Focus left / right   | <kbd>Super</kbd>+<kbd>[</kbd> / <kbd>]</kbd>                   |
| Swap left / right    | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>[</kbd> / <kbd>]</kbd>   |
| Move to next monitor | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>M</kbd>                  |
| Move to prev monitor | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> |

The split is deliberate: <kbd>Super</kbd>+<kbd>Ctrl</kbd> moves _windows_, and
bare <kbd>Super</kbd>+bracket moves _focus_ without touching anything.

Focus and swap both cross monitors. Frame rectangles are absolute, so the
monitor to your right is simply where the windows further right are, and a
swapped window lands exactly where its neighbour was.

Assigning a shortcut that another Tiler action already holds clears it from that
action first. Leaving both set would not work: Mutter registers whichever it
sees first and refuses the other, so one of the two would show as bound in the
preferences window and do nothing.

Change any of them, and the gap between windows, in the preferences window.

## Install

From a clone:

```
just setup
just install
just enable
```

Log out and back in if the Shell does not pick it up. `just prefs` opens the
preferences window, `just logs` follows the extension's output, and
`just disable` turns it off again without uninstalling.

## Develop

```
just            # list every recipe
just fmt        # prettier and eslint --fix, in place
just test       # unit suite, runs on Node in about a fifth of a second
just coverage   # the same suite with a coverage report
just lint       # eslint, prettier, gschema and shellcheck
just security   # gitleaks, trivy, osv-scanner, actionlint, zizmor
just build      # the installable zip
just ci         # everything above — what CI runs
just test-live  # boot a throwaway headless Shell and smoke-test it
just run        # nested Shell for trying things by hand
just clean      # remove node_modules, coverage and build output
```

`mise.toml` pins every tool, so `just ci` behaves the same locally and on a
runner. `gjs`, `glib-compile-schemas` and `gnome-shell` come from the system
rather than mise, because they have to match the Shell you are targeting.

The code is split so that every decision is testable off the Shell. Each
module below imports nothing at all — not `gi://`, not `resource:///` — so
Vitest runs it directly on Node:

- `modules/zones.js` imports nothing at all — the zone table, the projection to
  pixels, the zone matching and the cycling. Vitest runs it directly on Node.
- `modules/windows.js` also imports nothing — the rules for which windows may be
  placed and which may take focus. These are worth isolating because getting one
  wrong is silent: the shortcut simply does nothing and no error is logged.
- `modules/neighbours.js` imports nothing — which window lies next to another
  in a given direction. Extracted from the Shell layer because it was the one
  piece of real arithmetic left there, and getting it wrong is quiet: focus
  moves somewhere unexpected, or nowhere, and nothing is logged.
- `modules/actions.js` — the single list of actions, shared with the preferences
  process so the two cannot drift apart. A test reads the gschema and fails if
  they do.
- `modules/shortcuts.js` — the rules for assigning accelerators: which
  combinations may be bound, what the capture dialog should do about a keypress,
  and which other action already holds a shortcut. The Gdk and Gtk values are
  passed in by `prefs.js` rather than imported, which is what keeps this file
  runnable on Node.

`modules/tiler.js` is the only file that touches Meta, Shell or Main, and
`prefs.js` the only one that touches Adw and Gtk. Both read facts off the
toolkit and act on them; the decisions belong to the modules above.

`tiler.js` is unit-tested all the same. `vitest.config.js` aliases the `gi://`
and `resource:///` specifiers to stubs in `tests/stubs`, and `tests/support`
models the parts of Mutter the extension actually depends on — notably that a
maximized window reports the work area as its frame rect, and that
`allows_resize()` is false while a window is maximized. Every bug fixed in that
file has a regression test that fails without its fix.

`prefs.js` is the one file with no coverage, and deliberately: everything it
used to decide now lives in `modules/shortcuts.js`. What is left is widget
construction, which a unit test could only check against stubs of Adw and Gtk —
that tests the stubs. The exclusion is written into both `vitest.config.js` and
`sonar-project.properties` so the two cannot disagree.

`scripts/headless-check.sh` boots a throwaway Shell and checks that the
extension enables, disables and re-enables without leaking a signal and without
a JavaScript error. It presses no keys and asserts no geometry: it is a lifetime
check against a real Shell, where the unit suite is what covers placement.

## Releasing

Set `version-name` in `metadata.json` and `version` in `package.json` to the new
version, commit, then tag and push:

```
git tag -a v0.1.0 -m 'release v0.1.0'
git push origin v0.1.0
```

The tag drives everything. CI checks that it matches the version in both files
and stops before building if it does not — a release titled `v0.2.0` containing
a zip that tells GNOME it is `0.1.0` is worse than no release. It then runs the
full suite, builds the zip and attaches it to a GitHub release.

Uploading to extensions.gnome.org stays manual: it needs a browser login and has
no API.

## Licence

GPL-3.0-or-later.
