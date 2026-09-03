// How an accelerator is spelled for a reader.
//
// This file imports nothing — not gi://, not resource:/// — for the reason
// modules/zones.js gives, and for one more: gnome-shell has no Gtk. The
// preferences window can hand a Gtk.ShortcutLabel an accelerator and get
// "Super+Ctrl+←" back, but the quick settings menu runs in the Shell process,
// where Gtk does not exist and Gtk.accelerator_get_label cannot be called. The
// menu needs that text anyway, so it is worked out here instead.
//
// The rules are also what tests/actions.test.js compares the README and the
// documentation site against, so the tables below are the single place that
// decides how a shortcut is written down anywhere in the project.

/**
 * Modifier order as rendered, which is deliberately not the order they were
 * written in.
 *
 * Every default in the gschema happens to be written Super first, but prefs.js
 * writes a rebound shortcut with Gtk.accelerator_name_with_keycode, which emits
 * GTK's own order — `<Shift><Control><Super>m`. Rendering the written order
 * would show a rebound shortcut as "Shift+Ctrl+Super+M" beside untouched ones
 * reading "Super+Ctrl+…", so a fixed order is used and rebinding cannot change
 * how anything is spelled.
 *
 * @type {ReadonlyArray<string>}
 */
export const MODIFIER_ORDER = Object.freeze([
    'super',
    'ctrl',
    'alt',
    'shift',
    'meta',
    'hyper',
]);

// A Map rather than an object literal for the reason given in modules/zones.js:
// a bare index resolves inherited keys, so a modifier or key named
// 'constructor' or '__proto__' would return something that is not a label.
const MODIFIER_ALIASES = new Map([
    ['primary', 'ctrl'],
    ['control', 'ctrl'],
    ['ctrl', 'ctrl'],
    ['mod1', 'alt'],
    ['alt', 'alt'],
    ['mod4', 'super'],
    ['super', 'super'],
    ['shift', 'shift'],
    ['meta', 'meta'],
    ['hyper', 'hyper'],
]);

const MODIFIER_LABELS = new Map([
    ['super', 'Super'],
    ['ctrl', 'Ctrl'],
    ['alt', 'Alt'],
    ['shift', 'Shift'],
    ['meta', 'Meta'],
    ['hyper', 'Hyper'],
]);

// Gdk key names whose display text is not simply the name capitalised. The
// arrows are the ones that matter: "Super+Ctrl+Left" beside a table that says
// "Super+Ctrl+←" reads as two different shortcuts.
const KEY_LABELS = new Map([
    ['left', '←'],
    ['right', '→'],
    ['up', '↑'],
    ['down', '↓'],
    ['bracketleft', '['],
    ['bracketright', ']'],
    ['return', 'Enter'],
    ['kp_enter', 'Enter'],
    ['space', 'Space'],
    ['escape', 'Esc'],
    ['page_up', 'Page Up'],
    ['page_down', 'Page Down'],
    ['plus', '+'],
    ['minus', '-'],
    ['equal', '='],
    ['comma', ','],
    ['period', '.'],
    ['slash', '/'],
    ['backslash', '\\'],
    ['semicolon', ';'],
    ['apostrophe', "'"],
    ['grave', '`'],
]);

/**
 * Split a GSettings accelerator into its modifiers and its key.
 *
 * `<Release>` is dropped: it says when the binding fires, not what is pressed.
 * A modifier that is not recognised is kept rather than discarded — a shortcut
 * rendered with a modifier missing claims something false about which keys to
 * press, which is worse than one rendered oddly.
 *
 * @param {string} accelerator Accelerator in gschema form, e.g. '<Super>Left'.
 * @returns {{modifiers: string[], key: string}} Canonical modifiers, in
 *   MODIFIER_ORDER, and the lower-case key name.
 */
export function parseAccelerator(accelerator) {
    if (typeof accelerator !== 'string') return { modifiers: [], key: '' };

    const tokens = [...accelerator.matchAll(/<([^<>]+)>/g)]
        .map(match => match[1].toLowerCase())
        .filter(token => token !== 'release')
        .map(token => MODIFIER_ALIASES.get(token) ?? token);

    // A Set because '<Control><Primary>x' names the same modifier twice, and
    // "Ctrl+Ctrl+X" is not a shortcut anyone would recognise.
    const seen = new Set(tokens);
    const known = MODIFIER_ORDER.filter(modifier => seen.has(modifier));
    const unknown = [...seen].filter(token => !MODIFIER_LABELS.has(token));

    // The key is whatever follows the last modifier, rather than the string
    // with every <...> removed. It says what an accelerator actually is —
    // modifiers, then one key — and it is exact: a key name never contains
    // '>', because Gdk calls that one 'greater'. Stripping angle brackets
    // instead reads as an attempt to sanitise markup, which is also how CodeQL
    // reads it.
    const lastModifier = accelerator.lastIndexOf('>');

    return {
        modifiers: [...known, ...unknown],
        key: accelerator.slice(lastModifier + 1).toLowerCase(),
    };
}

/**
 * The display text for one key name.
 *
 * @param {string} key Lower-case Gdk key name.
 * @returns {string} Text to show, or '' if there is no key.
 */
function keyLabel(key) {
    if (!key) return '';

    const known = KEY_LABELS.get(key);
    if (known) return known;

    // A function key, then a single character, then a keyval GTK could not name
    // — it emits those as '0x41', and without Gdk there is nothing better to
    // say than what it gave us.
    if (/^f\d+$/.test(key)) return key.toUpperCase();
    if ([...key].length === 1) return key.toUpperCase();
    if (/^0x[0-9a-f]+$/.test(key)) return key;

    const spaced = key.replaceAll('_', ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Render an accelerator the way the README, the documentation site and the
 * quick settings menu all spell it.
 *
 * @param {string} accelerator Accelerator in gschema form.
 * @returns {string} e.g. 'Super+Ctrl+←', or '' if it names no key.
 */
export function acceleratorLabel(accelerator) {
    const { modifiers, key } = parseAccelerator(accelerator);
    const label = keyLabel(key);

    // Modifiers with no key is not a shortcut, and neither is the empty string
    // GSettings holds for an unbound action. Both render as nothing at all;
    // prefs.js is where "Disabled" is spelled out, and repeating it in the menu
    // would be noise.
    if (!label) return '';

    const parts = modifiers.map(
        modifier =>
            MODIFIER_LABELS.get(modifier) ??
            modifier.charAt(0).toUpperCase() + modifier.slice(1),
    );

    return [...parts, label].join('+');
}

/**
 * The display text for a keybinding as GSettings actually stores it.
 *
 * Keybinding keys are `as`, and Mutter uses the first entry. A key that has
 * never been set, or that the preferences window cleared, is an empty array.
 *
 * @param {string[]} bindings Accelerators for one action.
 * @returns {string} Display text, or '' if the action is unbound.
 */
export function bindingLabel(bindings) {
    return acceleratorLabel(bindings?.[0] ?? '');
}
