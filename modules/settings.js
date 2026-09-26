// The settings that are not actions.
//
// This file imports nothing, for the same two reasons modules/actions.js gives:
// prefs.js runs in a process with no access to gnome-shell's resource://
// modules and must be able to load it, and Vitest has to reach it on plain Node
// so tests/settings.test.js can check it against the gschema.
//
// Three files need the string 'shortcuts-enabled' — modules/quicktiler.js reads
// it, modules/panel.js writes it, prefs.js binds it. Three spellings of one key
// is the drift modules/actions.js exists to prevent, so it is written once here.

/**
 * Schema keys that are settings rather than keybindings.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const KEYS = Object.freeze({
    GAP: 'gap',
    SHORTCUTS_ENABLED: 'shortcuts-enabled',
    SHOW_QUICK_SETTINGS: 'show-quick-settings',
});

/**
 * Each setting with the type the gschema declares it as, so
 * tests/settings.test.js can check both the names and the types.
 *
 * @type {ReadonlyArray<{key: string, type: string}>}
 */
export const SETTINGS = Object.freeze([
    Object.freeze({ key: KEYS.SHORTCUTS_ENABLED, type: 'b' }),
    Object.freeze({ key: KEYS.SHOW_QUICK_SETTINGS, type: 'b' }),
    Object.freeze({ key: KEYS.GAP, type: 'i' }),
]);

/**
 * Just the keys, for callers that only need to enumerate them.
 *
 * @type {ReadonlyArray<string>}
 */
export const ALL_KEYS = Object.freeze(SETTINGS.map(setting => setting.key));

/**
 * A group of settings handlers that are released together.
 *
 * Gio.Settings has no connectObject, so a `changed::` handler has to be
 * disconnected by the id its connect returned. Both modules that watch settings
 * had grown their own bookkeeping for that — modules/quicktiler.js a named
 * field and a guarded disconnect block per key, modules/panel.js a list — and
 * the extension's whole claim is that it leaks nothing across an enable/disable
 * cycle. One implementation of that discipline is easier to check than two, and
 * adding a third watched key stops being three separate edits.
 *
 * A class rather than a list of teardown closures on purpose: a closure would
 * capture whatever scope it was built in and hold it for the watcher's
 * lifetime, where this holds the settings object and some integers.
 *
 * This file still imports nothing, so prefs.js and Vitest can both load it.
 */
export class SettingsWatcher {
    /**
     * @param {Gio.Settings} settings Settings to watch.
     */
    constructor(settings) {
        this._settings = settings;
        this._ids = [];
    }

    /**
     * Watch one key.
     *
     * @param {string} key Settings key to watch.
     * @param {Function} callback Called when it changes.
     */
    watch(key, callback) {
        this._ids.push(this._settings.connect(`changed::${key}`, callback));
    }

    /** Disconnect everything watched so far. Idempotent. */
    release() {
        for (const id of this._ids) this._settings.disconnect(id);
        this._ids = [];
    }
}
