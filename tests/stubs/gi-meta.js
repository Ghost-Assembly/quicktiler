// Stand-in for gi://Meta, wired up by the aliases in vitest.config.js.
//
// Only the constants modules/tiler.js actually reads. Values match Mutter's
// where a test asserts on them; where they do not matter they are distinct
// integers so a mix-up shows up as a failure rather than a coincidence.

export default {
    WindowType: { NORMAL: 0, DIALOG: 1, DOCK: 2 },
    MaximizeFlags: { HORIZONTAL: 1, VERTICAL: 2, BOTH: 3 },
    KeyBindingFlags: { NONE: 0, IGNORE_AUTOREPEAT: 1 },
    // Mutter returns this from add_keybinding when registration fails.
    KeyBindingAction: { NONE: 0 },
};
