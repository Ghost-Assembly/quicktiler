// Stand-in for resource:///org/gnome/shell/extensions/extension.js.
//
// The real base class resolves and caches a Gio.Settings from the gschema.
// Tests set `settings` on the instance instead, so extension.js can be driven
// without a schema or a live Shell.

export class Extension {
    /**
     * @param {object} [metadata] Contents of metadata.json.
     */
    constructor(metadata = {}) {
        this.metadata = metadata;
        this.settings = null;

        // The real one is the extension's install directory. extension.js
        // builds the tile's icon path from it, and tests assert on that path
        // rather than on a file that has to exist.
        this.path = '/nonexistent/quicktiler';

        /** Every openPreferences call, so a test can count them. */
        this.preferencesOpened = 0;
    }

    /**
     * @returns {object} Whatever the test assigned to `settings`.
     */
    getSettings() {
        return this.settings;
    }

    /** Open the preferences window. Recorded rather than performed. */
    openPreferences() {
        this.preferencesOpened += 1;
    }
}
