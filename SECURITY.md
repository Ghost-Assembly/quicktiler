# Security policy

## Supported versions

The most recent release is supported. QuickTiler runs inside the GNOME Shell process,
so it is only ever supported on the Shell versions named in `metadata.json`.

## Reporting a vulnerability

Report privately through GitHub's
[security advisory form](https://github.com/Ghost-Assembly/quicktiler/security/advisories/new)
rather than opening a public issue.

Please include the Shell version, the extension version from `metadata.json`,
and the steps to reproduce. You should get an acknowledgment within a week.

## Scope

QuickTiler has no network access, reads no files beyond its own GSettings schema and
the icon it ships, and stores no credentials. The realistic security surface is:

- The accelerator strings in GSettings. `Main.wm.addKeybinding` is given only the
  keybinding _names_, which are fixed in the code; Mutter reads the strings
  under those names and parses them itself. The same strings are rendered into
  labels, in the quick settings menu and in the preferences window.
- Window geometry read back from Mutter and used to compute a placement.

Anything that lets one of those escape the extension's own process, or that
crashes or hangs the Shell, is in scope.
