// Clutter, as far as modules/panel.js uses it.
//
// The gesture classes are deliberately absent, because the panel constructs
// none: its rows are PopupMenu items, which carry their own activation. A stub
// that offered them would invite code that depends on a Clutter version this
// project has not checked against.

export default {
    ActorAlign: { FILL: 0, START: 1, CENTER: 2, END: 3 },
};
