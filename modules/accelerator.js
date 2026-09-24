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

// A Map rather than an object literal for the reason given in modules/zones.js:
// a bare index resolves inherited keys, so a modifier or key named
// 'constructor' or '__proto__' would return something that is not a label.
//
// Declared in render order, because MODIFIER_ORDER below is its key order.
const MODIFIER_LABELS = new Map([
    ['super', 'Super'],
    ['ctrl', 'Ctrl'],
    ['alt', 'Alt'],
    ['shift', 'Shift'],
    ['meta', 'Meta'],
    ['hyper', 'Hyper'],
]);

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
 * Derived from MODIFIER_LABELS rather than written out again: parseAccelerator
 * orders by this list and partitions unknown modifiers by that map, so two
 * hand-maintained copies could disagree about which modifiers are known.
 *
 * @type {ReadonlyArray<string>}
 */
export const MODIFIER_ORDER = Object.freeze([...MODIFIER_LABELS.keys()]);

// Only the spellings that map to a different name. parseAccelerator falls back
// to the token itself, so an identity entry here would decide nothing.
const MODIFIER_ALIASES = new Map([
    ['primary', 'ctrl'],
    ['control', 'ctrl'],
    ['mod1', 'alt'],
    ['mod4', 'super'],
]);

/**
 * Upper-case the first character, leaving the rest alone.
 *
 * The one rule for rendering a token neither lookup table names — an unknown
 * modifier and an unknown key name are the same problem, so they are spelled
 * the same way.
 *
 * @param {string} word Token to capitalize.
 * @returns {string} The token, first character upper-cased.
 */
const capitalise = word => word.charAt(0).toUpperCase() + word.slice(1);

// Gdk key names whose display text is not simply the name capitalized. The
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
 * A modifier that is not recognized is kept rather than discarded — a shortcut
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
    // "Ctrl+Ctrl+X" is not a shortcut anyone would recognize.
    const seen = new Set(tokens);
    const known = MODIFIER_ORDER.filter(modifier => seen.has(modifier));
    const unknown = [...seen].filter(token => !MODIFIER_LABELS.has(token));

    // The key is whatever follows the last modifier, rather than the string
    // with every <...> removed. It says what an accelerator actually is —
    // modifiers, then one key — and it is exact: a key name never contains
    // '>', because Gdk calls that one 'greater'. Stripping angle brackets
    // instead reads as an attempt to sanitize markup, which is also how CodeQL
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

    return capitalise(key.replaceAll('_', ' '));
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
        modifier => MODIFIER_LABELS.get(modifier) ?? capitalise(modifier),
    );

    return [...parts, label].join('+');
}

/**
 * The accelerator a keybinding holds, as GSettings actually stores it.
 *
 * Keybinding keys are `as`, and Mutter uses the first entry. A key that has
 * never been set, or that the preferences window cleared, is an empty array.
 *
 * Exported because prefs.js needs the raw accelerator rather than the rendered
 * label — Gtk.ShortcutLabel does its own rendering. Written here so that the
 * array shape is decoded in one module instead of at each call site.
 *
 * @param {string[]} bindings Accelerators for one action.
 * @returns {string} The accelerator, or '' if the action is unbound.
 */
export function acceleratorOf(bindings) {
    return bindings?.[0] ?? '';
}

/**
 * The display text for a keybinding as GSettings actually stores it.
 *
 * @param {string[]} bindings Accelerators for one action.
 * @returns {string} Display text, or '' if the action is unbound.
 */
export function bindingLabel(bindings) {
    return acceleratorLabel(acceleratorOf(bindings));
}
