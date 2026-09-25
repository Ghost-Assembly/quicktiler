// A fake Mutter world: windows, a workspace and monitors, behaving closely
// enough for modules/quicktiler.js to be driven end to end.
//
// The fakes model the Mutter behaviors the extension actually depends on and
// that its bugs came from: a maximized window reports the whole work area as
// its frame rect, and allows_resize() is false while a window is maximized.
//
// One more is opt-in, because it is how Wayland behaves and the synchronous
// default is how X11 mostly does: with `deferred`, a geometry change is only a
// request. Mutter sends the client a configure and the frame rect changes when
// the client commits (meta-window-wayland.c, move_resize), so reading
// get_frame_rect() straight after unmaximize() still answers the maximized
// frame. The maximized flags themselves change at once, as window->config does.
// commit() stands in for the client catching up.

import Meta from 'gi://Meta';

import { KEYS } from '../../modules/settings.js';
import * as Main from '../stubs/shell-main.js';
import { FakeActor } from './actors.js';

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
        deferred = false,
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
        this._deferred = deferred;
        /** The frame the client last committed, while a request is pending. */
        this._committed = null;

        this.minimized = minimized;
        this.maximized_horizontally = maximized;
        this.maximized_vertically = maximized;

        /** Geometry before the most recent maximize, as Mutter keeps it. */
        this._restore = { ...rect };
        /** Every move_resize_frame call, for asserting on placement. */
        this.moves = [];
        /** Every unmaximize() call, so a test can tell one happened. */
        this.unmaximizeCalls = 0;

        this.seq = nextSequence++;

        // Handler id -> {signal, callback}. Mutter emits 'unmanaged' when a
        // window closes, and modules/panel.js listens for it so the tile does
        // not keep the last window it saw focused alive after it has gone.
        this._handlers = new Map();
        this._nextHandlerId = 1;
    }

    connect(signal, callback) {
        const id = this._nextHandlerId++;
        this._handlers.set(id, { signal, callback });
        return id;
    }

    disconnect(id) {
        this._handlers.delete(id);
    }

    /** Handlers still connected, so a test can prove they were released. */
    get connectedHandlers() {
        return this._handlers.size;
    }

    /** Close the window, as Mutter does when the user does. */
    unmanage() {
        for (const handler of [...this._handlers.values()])
            if (handler.signal === 'unmanaged') handler.callback(this);
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
        return this._canResize && !this.is_maximized();
    }

    // Both directions, as meta_window_config_is_maximized is in Mutter 17 and 18.
    is_maximized() {
        return this.maximized_horizontally && this.maximized_vertically;
    }

    get_monitor() {
        return this._monitor;
    }
    get_workspace() {
        return this._workspace;
    }

    get_frame_rect() {
        return { ...(this._committed ?? this._frame()) };
    }

    /** The frame Mutter has asked for, whether or not the client has caught up. */
    _frame() {
        // A maximized window's frame rect is the work area, not its restore size.
        if (this.is_maximized() && this._workspace)
            return { ...this._workspace.get_work_area_for_monitor(this._monitor) };

        return { ...this._rect };
    }

    /**
     * Called before any geometry change. In deferred mode the first change
     * after a commit freezes what get_frame_rect() reports until the next one.
     */
    _request() {
        if (this._deferred && !this._committed) this._committed = this._frame();
    }

    /** The client acknowledges every pending configure and commits. */
    commit() {
        this._committed = null;
    }

    move_resize_frame(userOp, x, y, width, height) {
        this._request();
        this.moves.push({ userOp, x, y, width, height });
        this._rect = { x, y, width, height };
    }

    maximize() {
        this._request();
        this._restore = { ...this._rect };
        this.maximized_horizontally = true;
        this.maximized_vertically = true;
    }

    // Mutter 17 and 18 implement this as set_unmaximize_flags(BOTH).
    unmaximize() {
        this._request();
        this.unmaximizeCalls += 1;
        this.maximized_horizontally = false;
        this.maximized_vertically = false;
        this._rect = { ...this._restore };
    }

    move_to_monitor(monitor) {
        this._request();
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
 * global.display that modules/quicktiler.js reads the focused window from.
 *
 * @param {Array<object>} [workAreas] One work area per monitor.
 * @returns {{workspace: FakeWorkspace, focus: (window: object|null) => void}} World.
 */
export function createWorld(workAreas = [{ x: 0, y: 0, width: 1920, height: 1080 }]) {
    const workspace = new FakeWorkspace(workAreas);

    Main.layoutManager.monitors = workAreas.map(() => ({}));

    let focused = null;

    // A FakeActor rather than a plain object, because modules/panel.js connects
    // to notify::focus-window on it. Going through FakeActor is what puts that
    // handler in liveHandlers, so a panel that forgets to disconnect it fails
    // the teardown assertions instead of leaking quietly.
    const display = new FakeActor();
    display.get_focus_window = () => focused;

    globalThis.global = { display };

    return {
        workspace,
        display,
        focus(window) {
            focused = window;
            display.emit('notify::focus-window', display);
        },
    };
}

/**
 * A settings double over a plain map.
 *
 * @param {object} [values] Initial values by key.
 * @returns {object} Gio.Settings-shaped fake.
 */
export function createSettings(values = {}) {
    // Merged over the defaults rather than replacing them. createSettings({ gap:
    // 8 }) must still answer get_boolean('shortcuts-enabled'), or enable() binds
    // nothing and every caller that only cared about the gap breaks.
    const store = new Map([
        [KEYS.GAP, 8],
        [KEYS.SHORTCUTS_ENABLED, true],
        [KEYS.SHOW_QUICK_SETTINGS, true],
        ...Object.entries(values),
    ]);
    const handlers = new Map();
    let nextId = 1;

    /**
     * Store a value and fire the matching changed:: handlers, as GSettings does.
     *
     * @param {string} key Settings key.
     * @param {*} value New value.
     */
    const write = (key, value) => {
        store.set(key, value);
        for (const { signal, handler } of [...handlers.values()])
            if (signal === `changed::${key}`) handler();
    };

    return {
        connected: handlers,
        get_int: key => store.get(key),
        get_boolean: key => Boolean(store.get(key)),
        set_boolean(key, value) {
            write(key, value);
        },
        get_strv: key => store.get(key) ?? [],
        set_strv(key, value) {
            write(key, value);
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
            write(key, value);
        },
    };
}
