# Security policy

## Supported versions

The most recent release is supported. Tiler runs inside the GNOME Shell process,
so it is only ever supported on the Shell versions named in `metadata.json`.

## Reporting a vulnerability

Report privately through GitHub's
[security advisory form](https://github.com/napalm255/tiler/security/advisories/new)
rather than opening a public issue.

Please include the Shell version, the extension version from `metadata.json`,
and the steps to reproduce. You should get an acknowledgement within a week.

## Scope

Tiler has no network access, reads no files beyond its own GSettings schema, and
stores no credentials. The realistic security surface is:

- The keybinding strings in GSettings, which are passed to `Main.wm.addKeybinding`.
- Window geometry read back from Mutter and used to compute a placement.

Anything that lets one of those escape the extension's own process, or that
crashes or hangs the Shell, is in scope.
