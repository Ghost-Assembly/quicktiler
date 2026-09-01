// A fake Mutter world: windows, a workspace and monitors, behaving closely
// enough for modules/tiler.js to be driven end to end.
//
// The fakes model the two Mutter behaviours the extension actually depends on
// and that its bugs came from: a maximized window reports the whole work area
// as its frame rect, and allows_resize() is false while a window is maximized.

import Meta from 'gi://Meta';

import * as Main from '../stubs/shell-main.js';

let nextSequence = 1;

/** A stand-in for Meta.Window. */
export class FakeWindow {
    /**
     * @param {object} [options] Initial state.
     */
    constructor({
        rect = { x: 0, y: 0, width: 400, height: 300 },
        monitor = 0,
        workspace = null,
        type = Meta.WindowType.NORMAL,
        overrideRedirect = false,
        skipTaskbar = false,
        fullscreen = false,
        maximized = false,
        minimized = false,
        canMove = true,
        canResize = true,
    } = {}) {
        this._rect = { ...rect };
        this._monitor = monitor;
        this._workspace = workspace;
        this._type = type;
        this._overrideRedirect = overrideRedirect;
        this._skipTaskbar = skipTaskbar;
        this._fullscreen = fullscreen;
        this._canMove = canMove;
        this._canResize = canResize;

        this.minimized = minimized;
        this.maximized_horizontally = maximized;
        this.maximized_vertically = maximized;

        /** Geometry before the most recent maximize, as Mutter keeps it. */
        this._restore = { ...rect };
        /** Every move_resize_frame call, for asserting on placement. */
        this.moves = [];
        this.unmaximizeFlags = null;

        this.seq = nextSequence++;
    }

    get_stable_sequence() {
        return this.seq;
    }
    get_window_type() {
        return this._type;
    }
    is_override_redirect() {
        return this._overrideRedirect;
    }
    is_skip_taskbar() {
        return this._skipTaskbar;
    }
    is_fullscreen() {
        return this._fullscreen;
    }
    allows_move() {
        return this._canMove;
    }

    // Mutter's meta_window_allows_resize() is false for any maximized window.
    // modules/windows.js exists partly to work around exactly this.
    allows_resize() {
        return (
            this._canResize &&
            !(this.maximized_horizontally && this.maximized_vertically)
        );
    }

    get_monitor() {
        return this._monitor;
    }
    get_workspace() {
        return this._workspace;
    }

    // A maximized window's frame rect is the work area, not its restore size.
    get_frame_rect() {
        if (this.maximized_horizontally && this.maximized_vertically && this._workspace)
            return { ...this._workspace.get_work_area_for_monitor(this._monitor) };

        return { ...this._rect };
    }

    move_resize_frame(userOp, x, y, width, height) {
        this.moves.push({ userOp, x, y, width, height });
        this._rect = { x, y, width, height };
    }

    maximize() {
        this._restore = { ...this._rect };
        this.maximized_horizontally = true;
        this.maximized_vertically = true;
    }

    set_unmaximize_flags(flags) {
        this.unmaximizeFlags = flags;
    }

    unmaximize() {
        this.maximized_horizontally = false;
        this.maximized_vertically = false;
        this._rect = { ...this._restore };
    }

    move_to_monitor(monitor) {
        this._monitor = monitor;
    }
}

/** A stand-in for Meta.Workspace. */
export class FakeWorkspace {
    /**
     * @param {Array<object>} workAreas One work area per monitor.
     */
    constructor(workAreas) {
        this._workAreas = workAreas;
        this._windows = [];
    }

    get_work_area_for_monitor(monitor) {
        return this._workAreas.at(monitor);
    }

    list_windows() {
        return this._windows;
    }

    /**
     * @param {...FakeWindow} windows Windows to place on this workspace.
     * @returns {FakeWindow[]} The windows added.
     */
    add(...windows) {
        for (const window of windows) {
            window._workspace = this;
            this._windows.push(window);
        }

        return windows;
    }
}

/**
 * Build a workspace, register its monitors with the fake Main, and set the
 * global.display that modules/tiler.js reads the focused window from.
 *
 * @param {Array<object>} [workAreas] One work area per monitor.
 * @returns {{workspace: FakeWorkspace, focus: (window: object|null) => void}} World.
 */
export function createWorld(workAreas = [{ x: 0, y: 0, width: 1920, height: 1080 }]) {
    const workspace = new FakeWorkspace(workAreas);

    Main.layoutManager.monitors = workAreas.map(() => ({}));

    let focused = null;
    globalThis.global = { display: { get_focus_window: () => focused } };

    return {
        workspace,
        focus(window) {
            focused = window;
        },
    };
}

/**
 * A settings double over a plain map.
 *
 * @param {object} [values] Initial values by key.
 * @returns {object} Gio.Settings-shaped fake.
 */
export function createSettings(values = { gap: 8 }) {
    const store = new Map(Object.entries(values));
    const handlers = new Map();
    let nextId = 1;

    return {
        connected: handlers,
        get_int: key => store.get(key),
        get_strv: key => store.get(key) ?? [],
        set_strv(key, value) {
            store.set(key, value);
        },
        connect(signal, handler) {
            const id = nextId++;
            handlers.set(id, { signal, handler });
            return id;
        },
        disconnect(id) {
            handlers.delete(id);
        },
        /**
         * Change a value and fire the matching changed:: handlers.
         *
         * @param {string} key Settings key.
         * @param {*} value New value.
         */
        emitChange(key, value) {
            store.set(key, value);
            for (const { signal, handler } of handlers.values())
                if (signal === `changed::${key}`) handler();
        },
    };
}
