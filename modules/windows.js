// Pure window policy: which windows Tiler may place, and which it may focus.
//
// Like modules/zones.js this file imports nothing, so it is unit-tested on Node.
// The rules live here rather than inline in modules/tiler.js because getting one
// of them wrong is silent — the keybinding simply does nothing, with no error in
// the log to notice.
//
// Callers pass a plain description of the window rather than a Meta.Window;
// modules/tiler.js is responsible for reading those facts off Mutter.
//
// @typedef {object} WindowFacts
// @property {boolean} normal Window type is NORMAL.
// @property {boolean} overrideRedirect Window bypasses the window manager.
// @property {boolean} skipTaskbar Window asks to be hidden from window lists.
// @property {boolean} fullscreen Window is fullscreen.
// @property {boolean} maximized Window is maximized in both directions.
// @property {boolean} allowsMove Mutter permits moving the window.
// @property {boolean} allowsResize Mutter permits resizing the window *right now*.

/**
 * Whether Tiler may move and resize a window.
 *
 * The maximized case is the subtle one. Mutter's `meta_window_allows_resize()`
 * is defined as `has_resize_func && !maximized && !fullscreen && ...`, so it
 * reports false for every maximized window. Consulting it directly would make
 * maximized windows untouchable: the maximize toggle could never restore, and
 * tiling a maximized window would silently do nothing.
 *
 * Placement always unmaximizes first, so the right question is whether the
 * window will be resizable once unmaximized — which, for a maximized window,
 * `allowsResize` cannot answer.
 *
 * @param {WindowFacts|null} window Window description.
 * @returns {boolean} True if the window may be placed.
 */
export function isPlaceable(window) {
    if (!isManageable(window)) return false;

    return (
        !window.fullscreen &&
        window.allowsMove &&
        (window.maximized || window.allowsResize)
    );
}

/**
 * Whether Tiler may move focus to or from a window.
 *
 * Deliberately weaker than {@link isPlaceable}: moving focus resizes nothing, so
 * it must not inherit the placement rules. Sharing one predicate would make it
 * impossible to move focus off a maximized window, onto one, or off a window
 * whose minimum and maximum size hints are equal.
 *
 * @param {WindowFacts|null} window Window description.
 * @returns {boolean} True if the window may take focus.
 */
export function isFocusable(window) {
    return isManageable(window);
}

/**
 * The rules both predicates share: a real, ordinary, user-visible window.
 *
 * @param {WindowFacts|null} window Window description.
 * @returns {boolean} True if the window is one Tiler should consider at all.
 */
function isManageable(window) {
    return !!window && window.normal && !window.overrideRedirect && !window.skipTaskbar;
}
