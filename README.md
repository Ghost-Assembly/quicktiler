# QuickTiler

Keyboard-driven zone tiling for GNOME Shell.

Press a direction repeatedly and the focused window cycles through the zones on
that side. There is no overlay and no grid picker, and the extension runs no
timers.

There is a quick settings tile, listing every action with the shortcut it
currently holds — so the panel teaches the keyboard rather than replacing it.
While it is shown, the extension watches one global signal, the display's
focus-window change, so a menu row knows which window to act on even while the
open menu has taken focus. Turn the tile off and the extension holds no actors
and connects to no global signals at all.

**[Documentation →](https://ghost-assembly.github.io/quicktiler/)** — zones, architecture,
testing, packaging and releasing.

## Zones

Both common ultrawide layouts — `1/4 + 1/2 + 1/4` and `1/2 + 1/2` — are
span-merges of the same four-column grid, so QuickTiler has no notion of a "current
layout" to switch between. It has one flat list of zones and three cycles:

| Key         | Cycles through                                            |
| ----------- | --------------------------------------------------------- |
| Tile left   | left quarter → left half                                  |
| Tile right  | right quarter → right half                                |
| Tile center | center half → center top third → center bottom two thirds |

Which zone a window is in is read back from its own geometry on every keypress.
Nothing is remembered, so cycling works on windows that some other tool placed,
and there is no state to go stale.

## Shortcuts

| Action                   | Default                                                        |
| ------------------------ | -------------------------------------------------------------- |
| Tile left                | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>←</kbd>                  |
| Tile right               | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>→</kbd>                  |
| Tile center              | <kbd>Super</kbd>+<kbd>Ctrl</kbd>+<kbd>↑</kbd>                  |
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

## Quick settings

The tile sits in the system menu, under the same panel as the volume and
network controls.

Clicking the tile pauses the keyboard shortcuts and releases every accelerator,
so they go back to whatever else claims them; clicking it again takes them back.
The header says which state it is in.

Clicking the arrow opens the menu, which lists the four groups of actions —
tile, focus, swap and monitor — each row showing its current shortcut and acting
on the focused window when clicked. Rows keep working while the shortcuts are
paused, because the pause is about the keyboard only.

Two switches in the preferences window control it: **Show the tile**, which
decides whether it is built at all, and **Keyboard shortcuts**, the same pause
the tile writes. The pause switch is in the preferences window as well as on the
tile because it has to be — with the tile hidden, it is the only way back.

## Install

Needs GNOME Shell 49 or 50. From the latest release, with no clone and no
toolchain — `gnome-extensions` ships with GNOME Shell itself:

```
curl -LO 'https://github.com/Ghost-Assembly/quicktiler/releases/latest/download/quicktiler@napalm255.github.io.shell-extension.zip'
gnome-extensions install --force 'quicktiler@napalm255.github.io.shell-extension.zip'
```

That unpacks the extension and compiles its settings schema, so there is no
separate `glib-compile-schemas` step. Log out and back in — Wayland cannot
reload the Shell in place — then turn it on:

```
gnome-extensions enable quicktiler@napalm255.github.io
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

### Upgrading from Tiler 0.1.0

QuickTiler was called Tiler up to 0.1.0, and the rename changed the extension's
uuid. GNOME identifies an extension by that uuid, so 0.2.0 installs alongside
the old one rather than replacing it, and both try to claim the same shortcuts —
only one of them can. Remove the old one first:

```
gnome-extensions uninstall tiler@napalm255.github.io
```

The gap and shortcut settings do not carry over; they live under the old
schema path and are set again in the preferences window.

## Develop

```
just            # list every recipe
just test       # unit suite, runs on Node in about a fifth of a second
just lint       # eslint, prettier, gschema and shellcheck
just ci         # everything CI runs
just test-live  # headless Shell smoke test, then the packer check
just docs       # serve the documentation site locally
```

`modules/zones.js`, `windows.js`, `neighbors.js`, `actions.js`,
`shortcuts.js`, `accelerator.js` and `settings.js` import nothing at all, so
Vitest runs them on plain Node. `modules/quicktiler.js` is the only file that
touches Meta or Shell, and `modules/panel.js` the only one that touches St,
Clutter, PopupMenu or QuickSettings; both are unit-tested through stubs aliased
in `vitest.config.js`. The
[architecture](https://ghost-assembly.github.io/quicktiler/#architecture) and
[testing](https://ghost-assembly.github.io/quicktiler/#testing) sections of the
documentation go into why.

## Releasing

Set the version in `metadata.json` and `package.json`, commit, then tag and
push. CI checks the tag against both files before it builds anything. See
[releasing](https://ghost-assembly.github.io/quicktiler/#releasing).

## License

GPL-3.0-or-later.
