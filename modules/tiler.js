// Shell layer: the only file in Tiler that touches Meta, Shell or Main.
//
// Everything here needs a live gnome-shell, so none of it is unit-testable off
// the Shell. That is why it is kept thin and free of branching logic: geometry
// and cycling live in modules/zones.js, and the rules about which windows may
// be touched live in modules/windows.js. Both are pure and covered by Vitest.
// What is left here — reading facts off Mutter and calling it — is exercised by
// scripts/headless-check.sh.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isFocusable, isPlaceable } from './windows.js';
import { matchZone, nextZone, projectZone, zoneById } from './zones.js';

// Applications do not always take the size they are given; terminals in
// particular snap to whole character cells. Allow a few pixels of drift when
// deciding which zone a window is already in.
const MATCH_TOLERANCE = 8;

/**
 * Read the facts modules/windows.js needs off a Meta.Window.
 *
 * @param {Meta.Window|null} window Window to describe.
 * @returns {object|null} Plain description, or null.
 */
function describe(window) {
    if (!window) return null;

    return {
        normal: window.get_window_type() === Meta.WindowType.NORMAL,
        overrideRedirect: window.is_override_redirect(),
        skipTaskbar: window.is_skip_taskbar(),
        fullscreen: window.is_fullscreen(),
        maximized: window.maximized_horizontally && window.maximized_vertically,
        allowsMove: window.allows_move(),
        allowsResize: window.allows_resize(),
    };
}

/** Places windows into zones in response to keybindings. */
export class Tiler {
    /**
     * @param {Gio.Settings} settings The extension's settings, which also hold
     *   the keybinding arrays.
     */
    constructor(settings) {
        this._settings = settings;

        // Cached, not read per keypress. gTile hits GSettings several times per
        // placement and re-parses its preset strings on every press.
        this._gap = settings.get_int('gap');
        this._gapChangedId = settings.connect('changed::gap', () => {
            this._gap = this._settings.get_int('gap');
        });

        this._bindings = [];
    }

    /** Register every keybinding. */
    enable() {
        const bind = (key, handler) => {
            Main.wm.addKeybinding(
                key,
                this._settings,
                // Holding a tile key must not race through the whole cycle.
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL,
                handler,
            );
            this._bindings.push(key);
        };

        bind('tile-left', () => this._tile('left'));
        bind('tile-right', () => this._tile('right'));
        bind('tile-center', () => this._tile('center'));
        bind('tile-maximize', () => this._toggleMaximize());
        bind('focus-left', () => this._focusNeighbour(-1));
        bind('focus-right', () => this._focusNeighbour(1));
        bind('swap-left', () => this._swapNeighbour(-1));
        bind('swap-right', () => this._swapNeighbour(1));
        bind('move-monitor-next', () => this._moveToNextMonitor());
    }

    /**
     * Release every keybinding and signal.
     *
     * Each id is held in a named field and dropped explicitly. gTile leaks here:
     * it connects to `layoutManager.overviewGroup` but disconnects from
     * `layoutManager`, so its handler survives disable.
     */
    disable() {
        for (const key of this._bindings) Main.wm.removeKeybinding(key);
        this._bindings = [];

        if (this._gapChangedId) {
            this._settings.disconnect(this._gapChangedId);
            this._gapChangedId = 0;
        }
    }

    /**
     * The focused window, if it is safe to place.
     *
     * @returns {Meta.Window|null} Target window.
     */
    _target() {
        const window = global.display.get_focus_window();
        return isPlaceable(describe(window)) ? window : null;
    }

    /**
     * The focused window, if focus may be moved away from it.
     *
     * @returns {Meta.Window|null} Focus-navigation origin.
     */
    _focusOrigin() {
        const window = global.display.get_focus_window();
        return isFocusable(describe(window)) ? window : null;
    }

    /**
     * The work area of the monitor a window is on.
     *
     * Panel and dock struts are already excluded by Mutter, and reading it per
     * monitor is what makes multi-monitor support fall out for free.
     *
     * @param {Meta.Window} window Window to locate.
     * @returns {Mtk.Rectangle} Work area.
     */
    _workArea(window) {
        return window.get_workspace().get_work_area_for_monitor(window.get_monitor());
    }

    /**
     * Which zone a window currently occupies, read back from its geometry.
     *
     * @param {Meta.Window} window Window to inspect.
     * @returns {string|null} Zone id, or null if it is in none.
     */
    _currentZone(window) {
        return matchZone(
            window.get_frame_rect(),
            this._workArea(window),
            this._gap,
            MATCH_TOLERANCE,
        );
    }

    /**
     * Move and resize a window to a rectangle, in frame coordinates.
     *
     * Frame coordinates already exclude the client-side shadow, and Mutter does
     * the frame-to-buffer translation, so no invisible-border compensation is
     * needed here.
     *
     * @param {Meta.Window} window Window to place.
     * @param {{x: number, y: number, width: number, height: number}} rect Target frame.
     */
    _moveResize(window, rect) {
        if (window.maximized_horizontally || window.maximized_vertically) {
            window.set_unmaximize_flags(Meta.MaximizeFlags.BOTH);
            window.unmaximize();
        }

        window.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);
    }

    /**
     * Place a window into a zone.
     *
     * @param {Meta.Window} window Window to place.
     * @param {string|null} zoneId Zone id.
     */
    _place(window, zoneId) {
        const zone = zoneById(zoneId);
        if (!zone) return;

        this._moveResize(window, projectZone(zone, this._workArea(window), this._gap));
    }

    /**
     * Advance the focused window through a direction's zone cycle.
     *
     * @param {string} group Cycle to walk: 'left', 'right' or 'center'.
     */
    _tile(group) {
        const window = this._target();
        if (!window) return;

        this._place(window, nextZone(this._currentZone(window), group));
    }

    /**
     * Maximize, or restore if already maximized.
     *
     * This uses Mutter's own maximize rather than placing into a full-size
     * zone, so restore returns the window to its pre-maximize geometry and the
     * state stays in sync with the rest of GNOME. It therefore ignores the gap
     * setting, which is what maximizing is supposed to mean.
     */
    _toggleMaximize() {
        const window = this._target();
        if (!window) return;

        if (window.maximized_horizontally && window.maximized_vertically) {
            window.set_unmaximize_flags(Meta.MaximizeFlags.BOTH);
            window.unmaximize();
        } else {
            window.maximize();
        }
    }

    /**
     * The nearest window to one side of the focused window.
     *
     * Compares frame-rect centres rather than zones, so it works for windows
     * that were never tiled.
     *
     * @param {Meta.Window} window Window to search from.
     * @param {number} direction -1 for left, 1 for right.
     * @param {Function} accepts Predicate a candidate must satisfy.
     * @returns {Meta.Window|null} The neighbour, if there is one.
     */
    _neighbour(window, direction, accepts) {
        const rect = window.get_frame_rect();
        const centre = rect.x + rect.width / 2;
        const monitor = window.get_monitor();

        let best = null;
        let bestDistance = Infinity;

        for (const other of window.get_workspace().list_windows()) {
            if (other === window) continue;
            if (other.minimized || other.get_monitor() !== monitor) continue;
            if (!accepts(describe(other))) continue;

            const otherRect = other.get_frame_rect();
            const distance = (otherRect.x + otherRect.width / 2 - centre) * direction;

            if (distance <= 0 || distance >= bestDistance) continue;

            bestDistance = distance;
            best = other;
        }

        return best;
    }

    /**
     * Move focus to the neighbouring window without moving anything.
     *
     * @param {number} direction -1 for left, 1 for right.
     */
    _focusNeighbour(direction) {
        const window = this._focusOrigin();
        if (!window) return;

        const neighbour = this._neighbour(window, direction, isFocusable);
        if (neighbour) Main.activateWindow(neighbour);
    }

    /**
     * Exchange the focused window's geometry with its neighbour's.
     *
     * @param {number} direction -1 for left, 1 for right.
     */
    _swapNeighbour(direction) {
        const window = this._target();
        if (!window) return;

        const neighbour = this._neighbour(window, direction, isPlaceable);
        if (!neighbour) return;

        const from = window.get_frame_rect();
        const to = neighbour.get_frame_rect();

        this._moveResize(window, {
            x: to.x,
            y: to.y,
            width: to.width,
            height: to.height,
        });
        this._moveResize(neighbour, {
            x: from.x,
            y: from.y,
            width: from.width,
            height: from.height,
        });
    }

    /** Move the focused window to the next monitor, keeping its zone. */
    _moveToNextMonitor() {
        const window = this._target();
        if (!window) return;

        const count = Main.layoutManager.monitors.length;
        if (count < 2) return;

        // Read the zone before the move: afterwards the window is measured
        // against a different work area and would no longer match.
        const zoneId = this._currentZone(window);
        const target = (window.get_monitor() + 1) % count;

        window.move_to_monitor(target);

        // Project against the destination's work area directly: re-reading
        // get_monitor() here would depend on Mutter having already applied the
        // move, and a stale read would snap the window back to where it came
        // from.
        const zone = zoneById(zoneId);
        if (!zone) return;

        const workArea = window.get_workspace().get_work_area_for_monitor(target);
        this._moveResize(window, projectZone(zone, workArea, this._gap));
    }
}
