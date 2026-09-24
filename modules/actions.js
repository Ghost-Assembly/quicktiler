// The one list of QuickTiler's actions.
//
// This file imports nothing — not gi://, not resource:/// — for two reasons.
// It has to be loadable from the preferences process, which has no access to
// gnome-shell's resource:// modules, and it has to be loadable by Vitest on
// plain Node so tests/actions.test.js can check it against the gschema.
//
// The list previously existed three times: as keys in the gschema, as bind()
// calls in modules/quicktiler.js, and as labels in prefs.js, with nothing checking
// that the three agreed. Adding a key to two of them produced a shortcut that
// was configurable and did nothing, with no error logged anywhere — the same
// silent-failure mode modules/windows.js exists to avoid.

/**
 * The operations QuickTiler can perform, as opposed to the actions that name
 * them. Several actions share one operation, differing only in their argument.
 *
 * Written here rather than in modules/quicktiler.js so that the mapping from an
 * action to a behavior is data this file owns, and so tests/actions.test.js can
 * check every action names one of these. That check is the point: the handler
 * table used to be a fourth hand-written copy of the key strings, guarded only
 * by a console.warn at runtime, which is the silent-failure mode this file
 * exists to prevent.
 *
 * @type {ReadonlyArray<string>}
 */
export const OPERATIONS = Object.freeze([
    'tile',
    'maximize',
    'focus',
    'swap',
    'monitor',
]);

/**
 * Every action QuickTiler binds, in the order the preferences window lists them.
 *
 * `group` names the quick settings menu section the action is listed under;
 * see GROUPS below.
 *
 * `op` is the operation from OPERATIONS that performs it, and `arg` is the one
 * argument that operation takes — a zone cycle for 'tile', a direction of -1 or
 * 1 for the rest. 'maximize' takes none. Written as data so that adding an
 * action is an edit to this list and the gschema, and never to a third table
 * that nothing checks.
 *
 * `label` is untranslated. prefs.js passes it through gettext at row-build
 * time; nothing here may import gettext. If a po/ directory is ever added,
 * this file needs to be in POTFILES so xgettext sees these strings.
 *
 * @type {ReadonlyArray<{key: string, group: string, label: string, op: string,
 *   arg?: string|number}>}
 */
export const ACTIONS = Object.freeze([
    Object.freeze({
        key: 'tile-left',
        group: 'tile',
        label: 'Tile left',
        op: 'tile',
        arg: 'left',
    }),
    Object.freeze({
        key: 'tile-right',
        group: 'tile',
        label: 'Tile right',
        op: 'tile',
        arg: 'right',
    }),
    Object.freeze({
        key: 'tile-center',
        group: 'tile',
        label: 'Tile center',
        op: 'tile',
        arg: 'center',
    }),
    Object.freeze({
        key: 'tile-maximize',
        group: 'tile',
        label: 'Maximize',
        op: 'maximize',
    }),
    Object.freeze({
        key: 'focus-left',
        group: 'focus',
        label: 'Focus left',
        op: 'focus',
        arg: -1,
    }),
    Object.freeze({
        key: 'focus-right',
        group: 'focus',
        label: 'Focus right',
        op: 'focus',
        arg: 1,
    }),
    Object.freeze({
        key: 'swap-left',
        group: 'swap',
        label: 'Swap left',
        op: 'swap',
        arg: -1,
    }),
    Object.freeze({
        key: 'swap-right',
        group: 'swap',
        label: 'Swap right',
        op: 'swap',
        arg: 1,
    }),
    Object.freeze({
        key: 'move-monitor-next',
        group: 'monitor',
        label: 'Move to next monitor',
        op: 'monitor',
        arg: 1,
    }),
    Object.freeze({
        key: 'move-monitor-prev',
        group: 'monitor',
        label: 'Move to previous monitor',
        op: 'monitor',
        arg: -1,
    }),
]);

/**
 * The sections the quick settings menu lists actions under, in menu order.
 *
 * Ten rows in one flat menu is a wall; four collapsible sections is a list you
 * can read. The grouping lives here, beside the actions themselves, rather than
 * in modules/panel.js — a second list written out there is exactly the drift
 * this file exists to prevent.
 *
 * `label` is untranslated, for the same reason the action labels are.
 *
 * @type {ReadonlyArray<{id: string, label: string}>}
 */
export const GROUPS = Object.freeze([
    Object.freeze({ id: 'tile', label: 'Tile' }),
    Object.freeze({ id: 'focus', label: 'Focus' }),
    Object.freeze({ id: 'swap', label: 'Swap' }),
    Object.freeze({ id: 'monitor', label: 'Monitor' }),
]);

/**
 * Just the schema keys, for callers that only need to enumerate them.
 *
 * @type {ReadonlyArray<string>}
 */
export const ACTION_KEYS = Object.freeze(ACTIONS.map(action => action.key));

/**
 * Every action, keyed by its schema key.
 *
 * A Map for the reason given below, and so that run() can look an action up
 * without walking the list on every keypress.
 *
 * @type {Map<string, {key: string, group: string, label: string, op: string,
 *   arg?: string|number}>}
 */
export const ACTIONS_BY_KEY = new Map(ACTIONS.map(action => [action.key, action]));

/**
 * The actions in each group, keyed by group id.
 *
 * A Map rather than an object literal for the reason given in modules/zones.js:
 * a bare index resolves inherited keys, so a group id of 'constructor' would
 * answer with something that is not a list of actions.
 *
 * @type {Map<string, ReadonlyArray<{key: string, group: string, label: string}>>}
 */
export const ACTIONS_BY_GROUP = new Map(
    GROUPS.map(group => [
        group.id,
        Object.freeze(ACTIONS.filter(action => action.group === group.id)),
    ]),
);
