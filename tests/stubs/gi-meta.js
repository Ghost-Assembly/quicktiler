// Stand-in for gi://Meta, wired up by the aliases in vitest.config.js.
//
// Only the constants modules/quicktiler.js actually reads. Values match Mutter's
// where a test asserts on them; where they do not matter they are distinct
// integers so a mix-up shows up as a failure rather than a coincidence.

export default {
    WindowType: { NORMAL: 0, DIALOG: 1, DOCK: 2 },
    KeyBindingFlags: { NONE: 0, IGNORE_AUTOREPEAT: 1 },
    // Mutter returns this from add_keybinding when the name is already registered.
    KeyBindingAction: { NONE: 0 },
};
