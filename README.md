# QuickTiler

<!-- quick-template:badges:start -->

[![CI](https://github.com/Ghost-Assembly/quicktiler/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Ghost-Assembly/quicktiler/actions/workflows/ci.yml)
[![Security](https://github.com/Ghost-Assembly/quicktiler/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/Ghost-Assembly/quicktiler/actions/workflows/security.yml)
[![Docs](https://img.shields.io/website?url=https%3A%2F%2Fghost-assembly.com%2Fquicktiler%2F&label=docs)](https://ghost-assembly.com/quicktiler/)
[![Release](https://img.shields.io/github/v/release/Ghost-Assembly/quicktiler)](https://github.com/Ghost-Assembly/quicktiler/releases/latest)
[![License](https://img.shields.io/github/license/Ghost-Assembly/quicktiler)](https://github.com/Ghost-Assembly/quicktiler/blob/main/LICENSE)
[![GNOME](https://img.shields.io/badge/GNOME-49%20%7C%2050-blue)](https://ghost-assembly.com/quicktiler/#install)
[![Security issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quicktiler%26metricKeys%3Dsoftware_quality_security_issues&query=%24.component.measures%5B0%5D.value&label=Security+issues)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quicktiler)
[![Reliability issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quicktiler%26metricKeys%3Dsoftware_quality_reliability_issues&query=%24.component.measures%5B0%5D.value&label=Reliability+issues)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quicktiler)
[![Maintainability issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quicktiler%26metricKeys%3Dsoftware_quality_maintainability_issues&query=%24.component.measures%5B0%5D.value&label=Maintainability+issues)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quicktiler)
[![Duplication](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quicktiler%26metricKeys%3Dduplicated_lines_density&query=%24.component.measures%5B0%5D.value&label=Duplication)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quicktiler)
[![Coverage](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quicktiler%26metricKeys%3Dcoverage&query=%24.component.measures%5B0%5D.value&label=Coverage)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quicktiler)
[![Sonar policy](https://github.com/Ghost-Assembly/quicktiler/actions/workflows/sonar.yml/badge.svg?branch=main)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quicktiler)
<!-- quick-template:badges:end -->

Keyboard-driven zone tiling with a Quick Settings tile, no overlay and no timers.

Press a direction repeatedly and the focused window cycles through the zones on
that side. There is no overlay and no grid picker, and the extension runs no
timers.

There is a Quick Settings tile, listing every action with the shortcut it
currently holds — so the panel teaches the keyboard rather than replacing it.
While it is shown, the extension watches one global signal, the display's
focus-window change, so a menu row knows which window to act on even while the
open menu has taken focus. Turn the tile off and the extension holds no actors
and connects to no global signals at all.

**[Documentation →](https://ghost-assembly.com/quicktiler/)** — zones, architecture,
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

## Keyboard

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

## Quick Settings

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

<!-- quick-template:install:start -->

Requires GNOME Shell 49 or 50. Requires a GNOME desktop session; window behavior also depends on each application and its minimum size.

### From a release

Download the latest release ZIP and install it for your user. xh is a download tool; you can also download the ZIP from GitHub in a browser. Installing compiles the settings schema.

```sh
xh --download GET https://github.com/Ghost-Assembly/quicktiler/releases/latest/download/quicktiler@napalm255.github.io.shell-extension.zip
gnome-extensions install --force quicktiler@napalm255.github.io.shell-extension.zip
```

Log out and back in so GNOME discovers the extension, then enable it:

```sh
gnome-extensions enable quicktiler@napalm255.github.io
```

### From a clone

Install mise and activate it in your shell. Clone the repository, install its pinned tools, and build and install the same ZIP used for releases:

```sh
git clone https://github.com/Ghost-Assembly/quicktiler.git
cd quicktiler
mise install
mise exec -- just setup
mise exec -- just install
```

Log out and back in, then run just enable. Run just prefs to open preferences. After updating a loaded extension, start a new session to load its new code; opening preferences does not reload GNOME Shell.
<!-- quick-template:install:end -->

## Uninstall

<!-- quick-template:uninstall:start -->

Disable and uninstall the extension for your user. These commands preserve saved settings and other user data.

```sh
gnome-extensions disable quicktiler@napalm255.github.io
gnome-extensions uninstall quicktiler@napalm255.github.io
```

From a clone, just uninstall performs the same steps. Disabling with just disable leaves the extension installed.
<!-- quick-template:uninstall:end -->

## Testing

<!-- quick-template:testing:start -->

just test runs the JavaScript suite with Vitest, the shared tooling tests, and any project-specific offline suites. just coverage reports the JavaScript coverage universe, including untested runtime files. Test stubs and generated reports are not runtime source.

just test-docs runs Playwright and axe in Chromium and Firefox: dark and light accessibility checks, keyboard navigation, mobile layout, reduced motion, links, metadata, local assets, and no page JavaScript. Automated accessibility checks still require human review of reading and focus order.

just test-live checks the package and runs isolated GNOME lifecycle checks. It is a separate local check, not proof of compatibility from a hosted runner. Verify each declared GNOME version and complete the project's manual checks before releasing.
<!-- quick-template:testing:end -->

### Project checks

Recording Mutter stubs model maximized windows, deferred Wayland frame changes, client minimum sizes, and signal lifetimes. The isolated Shell check verifies enable/disable/re-enable and lifetime cleanup. Verify tiling geometry, monitors, minimum sizes, and shortcuts with real applications before release.

## Packaging

<!-- quick-template:packaging:start -->

```sh
just build
just pack-check
```

The output is quicktiler@napalm255.github.io.shell-extension.zip at the repository root, with metadata.json at the archive root. Python's standard library packages the explicit runtimeFiles allowlist in quick-project.json, using stable file order and timestamps.

just pack-check compares both filenames and file contents with GNOME's official packer and validates shipped icons. Docs, tests, dependencies, credentials, downloaded binaries, and development artifacts stay outside the ZIP. Update the runtime allowlist when adding a runtime file.
<!-- quick-template:packaging:end -->

## Releasing

<!-- quick-template:releasing:start -->

Run just ci, just test-live, and the project manual checklist. Set metadata.json version-name and package.json version to the same new version. The GNOME Extensions website assigns the numeric metadata.json version during submission. Update the npm lockfile, regenerate the docs, and commit the reviewed changes to main through a passing pull request.

Create and push a v-prefixed tag for that version. The release workflow verifies the version, main ancestry, and successful required checks for the tagged commit, then attaches its tested ZIP to a GitHub release. It does not upload to extensions.gnome.org; that submission and its review remain manual.
<!-- quick-template:releasing:end -->

## Development

<!-- quick-template:development:start -->

mise.toml pins runtime and CLI versions; justfile owns commands; npm owns development dependencies and the lockfile. GNOME libraries come from the host. On image-based Fedora, use the host's available tools or a toolbox/distrobox for missing system packages; do not layer packages onto the OS.

```sh
just setup        # install pinned tools, dependencies, and browsers
just fmt          # format source and configuration
just lint         # verify template, generated docs, source, and schemas
just test         # JavaScript, Python, and project offline tests
just coverage     # report JavaScript coverage without source exclusions
just test-docs    # Chromium and Firefox documentation checks
just security     # dependencies, secrets, and workflow checks
just build        # build the runtime-only extension ZIP
just pack-check   # compare files and contents with GNOME's packer
just ci           # complete local verification and packaging
just test-live    # isolated GNOME lifecycle and project integration checks
just docs         # serve the static site at localhost:8000
just template-check  # verify the pinned canonical template
just template-status # report a newer approved template revision
```

GitHub requires local verification, security analysis, and completed Sonar analysis. The shared Sonar policy requires zero security, reliability, and maintainability issues and zero duplicated lines. PR checks cover changed code; main checks cover the entire project. Missing configuration fails instead of silently skipping analysis. Pages publishes the tested docs only after the required checks pass on main.

Common tooling and these instructions are generated from a pinned canonical template. Change that source and synchronize its approved revision; do not edit generated sections or locally bless drift. Extension-specific behavior belongs in project configuration and project.just.
<!-- quick-template:development:end -->

## License

GPL-3.0-or-later.
