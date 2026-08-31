// The one list of Tiler's actions.
//
// This file imports nothing — not gi://, not resource:/// — for two reasons.
// It has to be loadable from the preferences process, which has no access to
// gnome-shell's resource:// modules, and it has to be loadable by Vitest on
// plain Node so tests/actions.test.js can check it against the gschema.
//
// The list previously existed three times: as keys in the gschema, as bind()
// calls in modules/tiler.js, and as labels in prefs.js, with nothing checking
// that the three agreed. Adding a key to two of them produced a shortcut that
// was configurable and did nothing, with no error logged anywhere — the same
// silent-failure mode modules/windows.js exists to avoid.

/**
 * Every action Tiler binds, in the order the preferences window lists them.
 *
 * `label` is untranslated. prefs.js passes it through gettext at row-build
 * time; nothing here may import gettext. If a po/ directory is ever added,
 * this file needs to be in POTFILES so xgettext sees these strings.
 *
 * @type {ReadonlyArray<{key: string, label: string}>}
 */
export const ACTIONS = Object.freeze([
    Object.freeze({ key: 'tile-left', label: 'Tile left' }),
    Object.freeze({ key: 'tile-right', label: 'Tile right' }),
    Object.freeze({ key: 'tile-center', label: 'Tile centre' }),
    Object.freeze({ key: 'tile-maximize', label: 'Maximize' }),
    Object.freeze({ key: 'focus-left', label: 'Focus left' }),
    Object.freeze({ key: 'focus-right', label: 'Focus right' }),
    Object.freeze({ key: 'swap-left', label: 'Swap left' }),
    Object.freeze({ key: 'swap-right', label: 'Swap right' }),
    Object.freeze({ key: 'move-monitor-next', label: 'Move to next monitor' }),
    Object.freeze({ key: 'move-monitor-prev', label: 'Move to previous monitor' }),
]);

/**
 * Just the schema keys, for callers that only need to enumerate them.
 *
 * @type {ReadonlyArray<string>}
 */
export const ACTION_KEYS = Object.freeze(ACTIONS.map(action => action.key));

/**
 * Which other actions already hold an accelerator.
 *
 * Two actions given the same accelerator do not both work: Mutter registers the
 * first and refuses the second, so the shortcut shows as set in the preferences
 * window and does nothing. Checking before writing is what stops that.
 *
 * @param {string} key Schema key of the action being assigned.
 * @param {string} accelerator Accelerator being assigned, as returned by
 *   Gtk.accelerator_name_with_keycode.
 * @param {(key: string) => string[]} bindingsFor Current accelerators for a key.
 *   Injected so this stays free of Gio; prefs.js passes settings.get_strv.
 * @returns {string[]} Keys of the actions already holding it, excluding `key`.
 */
export function conflictingActions(key, accelerator, bindingsFor) {
    if (!accelerator) return [];

    return ACTION_KEYS.filter(
        other => other !== key && bindingsFor(other).includes(accelerator),
    );
}
