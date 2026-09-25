// The rules for assigning accelerators to actions.
//
// Imports nothing from gi:// — the Gdk and Gtk values these rules need are
// passed in by prefs.js, and the two modules it does import import nothing
// themselves. That keeps the decisions testable on plain Node and leaves
// prefs.js holding only widget construction, which is the part no unit test
// can say anything useful about.

import { canonicalAccelerator } from './accelerator.js';
import { ACTION_KEYS } from './actions.js';

/** Close the capture dialog, changing nothing. */
export const CAPTURE_CANCEL = 'cancel';

/** Unbind the action and close. */
export const CAPTURE_CLEAR = 'clear';

/** Not bindable; swallow the key and keep waiting. */
export const CAPTURE_IGNORE = 'ignore';

/** Bind the combination and close. */
export const CAPTURE_ASSIGN = 'assign';

/**
 * Whether a captured key combination may be bound as a global shortcut.
 *
 * A bare key would steal it from every application, and Shift alone just types
 * a capital letter.
 *
 * @param {number} mask Modifier mask, already reduced to the default mod mask.
 * @param {number} keyval Key value.
 * @param {{shiftMask: number, acceleratorValid: Function}} gtk Gdk/Gtk values.
 * @returns {boolean} True if the combination may be bound.
 */
export function isValidBinding(mask, keyval, { shiftMask, acceleratorValid }) {
    if (mask === 0 || mask === shiftMask) return false;

    return acceleratorValid(keyval, mask);
}

/**
 * What the capture dialog should do about a keypress.
 *
 * Escape and Backspace are only treated as commands when pressed unmodified, so
 * that Ctrl+Escape and the like remain bindable rather than being swallowed.
 *
 * @param {number} keyval Key value.
 * @param {number} mask Modifier mask, reduced to the default mod mask.
 * @param {object} gtk Gdk/Gtk values: escapeKey, backspaceKey, shiftMask,
 *   acceleratorValid.
 * @returns {string} One of the CAPTURE_* outcomes.
 */
export function captureOutcome(keyval, mask, gtk) {
    if (mask === 0 && keyval === gtk.escapeKey) return CAPTURE_CANCEL;
    if (mask === 0 && keyval === gtk.backspaceKey) return CAPTURE_CLEAR;
    if (!isValidBinding(mask, keyval, gtk)) return CAPTURE_IGNORE;

    return CAPTURE_ASSIGN;
}

/**
 * Which other actions already hold an accelerator.
 *
 * Two actions given the same accelerator do not both work. Mutter registers
 * both — addKeybinding only refuses a keybinding *name* that is already
 * registered — and when it indexes the combination one binding overwrites the
 * other with a warning in the journal, so one of the two does nothing while
 * the preferences window shows both as set. Checking before
 * writing is what stops that.
 *
 * Compared in canonical form: the gschema and Gtk write modifiers in different
 * orders, and a string comparison would miss exactly the conflict that a
 * rebinding over a default creates.
 *
 * @param {string} key Schema key of the action being assigned.
 * @param {string} accelerator Accelerator being assigned.
 * @param {(key: string) => string[]} bindingsFor Current accelerators for a key.
 *   Injected so this stays free of Gio; prefs.js passes settings.get_strv.
 * @returns {string[]} Keys of the actions already holding it, excluding `key`.
 */
export function conflictingActions(key, accelerator, bindingsFor) {
    const wanted = canonicalAccelerator(accelerator);
    if (!wanted) return [];

    return ACTION_KEYS.filter(
        other =>
            other !== key &&
            bindingsFor(other).some(held => canonicalAccelerator(held) === wanted),
    );
}
