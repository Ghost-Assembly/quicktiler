// Gio, as far as modules/panel.js uses it.
//
// The extension's Gio.Settings comes from the Shell and is faked by
// createSettings in tests/support/world.js, so nothing here needs to resemble
// one. What is left is the gicon the tile is drawn with.

export default {
    // Returns an object rather than a string, so a test can tell an icon that
    // was built from the injected path apart from one that was not built at all.
    icon_new_for_string: name => ({ name, isGicon: true }),
};
