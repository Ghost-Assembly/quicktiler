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
    }

    /**
     * @returns {object} Whatever the test assigned to `settings`.
     */
    getSettings() {
        return this.settings;
    }
}
