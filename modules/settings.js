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
export const SETTING_KEYS = Object.freeze(SETTINGS.map(setting => setting.key));
