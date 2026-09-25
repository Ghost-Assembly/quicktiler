import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const stub = name =>
    fileURLToPath(new URL(`./tests/stubs/${name}.js`, import.meta.url));

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            // Everything the extension ships, so the denominator is the real
            // one. Listing only the modules that happen to be covered would
            // measure coverage against a figure chosen to flatter it.
            include: ['modules/**/*.js', 'extension.js', 'prefs.js'],
            // prefs.js is the sole exception, and only because every decision
            // it used to make now lives in modules/shortcuts.js and is tested
            // there. What is left is Adw and Gtk widget construction, which a
            // unit test can only assert against stubs of the toolkit — that
            // tests the stubs, not the code. Kept identical to
            // sonar.coverage.exclusions so the two agree.
            //
            // tests/** is listed because `include` above did not keep a
            // dynamically imported stub out of the report:
            // tests/quicktiler-handlers.test.js pulls a stub in through
            // vi.doMock and it turned up as production code. A stub counted
            // either way is a number that means nothing.
            exclude: ['prefs.js', 'tests/**'],
        },
    },

    // gnome-shell resolves these at runtime; Node cannot. Pointing them at
    // stubs is what makes the Shell layer — and the bugs fixed in it —
    // reachable from Vitest at all. The stubs live in tests/, so they are never
    // shipped and never counted as covered code.
    //
    // gi://Adw, gi://Gdk and gi://Gtk are deliberately absent. Only prefs.js
    // imports them, and it is excluded below and never imported by a test. The
    // day this list needs one of them is the day a decision has leaked into the
    // preferences widgets, and the missing alias is how we find out.
    resolve: {
        alias: [
            { find: 'gi://Clutter', replacement: stub('gi-clutter') },
            { find: 'gi://Gio', replacement: stub('gi-gio') },
            { find: 'gi://GObject', replacement: stub('gi-gobject') },
            { find: 'gi://Meta', replacement: stub('gi-meta') },
            { find: 'gi://Shell', replacement: stub('gi-shell') },
            { find: 'gi://St', replacement: stub('gi-st') },
            {
                find: 'resource:///org/gnome/shell/ui/popupMenu.js',
                replacement: stub('shell-popupmenu'),
            },
            {
                find: 'resource:///org/gnome/shell/ui/quickSettings.js',
                replacement: stub('shell-quicksettings'),
            },
            {
                find: 'resource:///org/gnome/shell/ui/main.js',
                replacement: stub('shell-main'),
            },
            {
                find: 'resource:///org/gnome/shell/extensions/extension.js',
                replacement: stub('shell-extension'),
            },
        ],
    },
});
