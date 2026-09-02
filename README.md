# Tiler

Keyboard-driven zone tiling for GNOME Shell.

Press a direction repeatedly and the focused window cycles through the zones on
that side. There is no overlay, no grid picker and no panel button — between
keypresses the extension creates no actors, runs no timers and connects to no
global signals, so it costs nothing at all.

**[Documentation →](https://napalm255.github.io/tiler/)** — zones, architecture,
testing, packaging and releasing.

## Zones

Both common ultrawide layouts — `1/4 + 1/2 + 1/4` and `1/2 + 1/2` — are
span-merges of the same four-column grid, so Tiler has no notion of a "current
layout" to switch between. It has one flat list of zones and three cycles:

| Key         | Cycles through                                            |
| ----------- | --------------------------------------------------------- |
| Tile left   | left quarter → left half                                  |
| Tile right  | right quarter → right half                                |
| Tile centre | centre half → centre top third → centre bottom two thirds |

Which zone a window is in is read back from its own geometry on every keypress.
Nothing is remembered, so cycling works on windows that some other tool placed,
and there is no state to go stale.

## Shortcuts

| Action                   | Default                                                        |
| ------------------------ | -------------------------------------------------------------- |
| Tile left                | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>←</kbd>                  |
| Tile right               | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>→</kbd>                  |
| Tile centre              | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>↑</kbd>                  |
| Maximize                 | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>↓</kbd>                  |
| Focus left               | <kbd>Super</kbd>+<kbd>[</kbd>                                  |
| Focus right              | <kbd>Super</kbd>+<kbd>]</kbd>                                  |
| Swap left                | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>[</kbd>                  |
| Swap right               | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>]</kbd>                  |
| Move to next monitor     | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>M</kbd>                  |
| Move to previous monitor | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> |

<kbd>Super</kbd>+<kbd>Ctrl</kbd> moves _windows_; bare <kbd>Super</kbd>+bracket
moves _focus_ without touching anything. Both focus and swap cross monitors.
Change any of them, and the gap between windows, in the preferences window.

## Install

Needs GNOME 49 or newer. From the latest release, with no clone and no
toolchain — `gnome-extensions` ships with GNOME Shell itself:

```
curl -LO 'https://github.com/napalm255/tiler/releases/latest/download/tiler@napalm255.github.io.shell-extension.zip'
gnome-extensions install --force 'tiler@napalm255.github.io.shell-extension.zip'
```

That unpacks the extension and compiles its settings schema, so there is no
separate `glib-compile-schemas` step. Log out and back in — Wayland cannot
reload the Shell in place — then turn it on:

```
gnome-extensions enable tiler@napalm255.github.io
```

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
just test       # unit suite, runs on Node in about a fifth of a second
just lint       # eslint, prettier, gschema and shellcheck
just ci         # everything CI runs
just test-live  # headless Shell smoke test, then the packer check
just docs       # serve the documentation site locally
```

`modules/zones.js`, `windows.js`, `neighbours.js`, `actions.js` and
`shortcuts.js` import nothing at all, so Vitest runs them on plain Node.
`modules/tiler.js` is the only file that touches Meta, Shell or Main, and is
unit-tested through stubs aliased in `vitest.config.js`. The
[architecture](https://napalm255.github.io/tiler/#architecture) and
[testing](https://napalm255.github.io/tiler/#testing) sections of the
documentation go into why.

## Releasing

Set the version in `metadata.json` and `package.json`, commit, then tag and
push. CI checks the tag against both files before it builds anything. See
[releasing](https://napalm255.github.io/tiler/#releasing).

## Licence

GPL-3.0-or-later.
