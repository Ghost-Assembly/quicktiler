// Stand-in for resource:///org/gnome/shell/ui/main.js.
//
// A module singleton, because that is what the real one is and what
// modules/tiler.js imports. Tests must call reset() in beforeEach, or state
// leaks between them.

/** Keybindings currently registered, by schema key. */
export const registered = new Map();

/** Every addKeybinding call, in order, for asserting on registration. */
export const addCalls = [];

/** Every removeKeybinding call, in order. */
export const removeCalls = [];

/** Windows passed to activateWindow, in order. */
export const activated = [];

/**
 * Keys that addKeybinding should refuse, standing in for an accelerator
 * collision. Mutter returns KeyBindingAction.NONE for those.
 */
export const refuse = new Set();

export const wm = {
    /**
     * @param {string} key Schema key.
     * @param {object} settings Settings holding it.
     * @param {number} flags Meta.KeyBindingFlags.
     * @param {number} modes Shell.ActionMode.
     * @param {Function} handler Called when the shortcut fires.
     * @returns {number} A non-zero action id, or 0 when refused.
     */
    addKeybinding(key, settings, flags, modes, handler) {
        addCalls.push({ key, settings, flags, modes, handler });
        if (refuse.has(key)) return 0;

        registered.set(key, handler);
        return addCalls.length;
    },

    /**
     * @param {string} key Schema key.
     */
    removeKeybinding(key) {
        removeCalls.push(key);
        registered.delete(key);
    },
};

export const layoutManager = { monitors: [{}] };

/**
 * @param {object} window Window to focus.
 */
export function activateWindow(window) {
    activated.push(window);
}

/** Clear all recorded state. Call from beforeEach. */
export function reset() {
    registered.clear();
    addCalls.length = 0;
    removeCalls.length = 0;
    activated.length = 0;
    refuse.clear();
    layoutManager.monitors = [{}];
}

/**
 * Fire a registered shortcut, as the Shell would on a keypress.
 *
 * @param {string} key Schema key.
 */
export function press(key) {
    const handler = registered.get(key);
    if (!handler) throw new Error(`no keybinding registered for ${key}`);

    handler();
}
