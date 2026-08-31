// Shell layer: the only file in Tiler that touches Meta, Shell or Main.
//
// Everything here needs a live gnome-shell, so none of it is unit-testable off
// the Shell. That is why it is kept thin and free of branching logic: geometry
// and cycling live in modules/zones.js, and the rules about which windows may
// be touched live in modules/windows.js. Both are pure and covered by Vitest.
//
// scripts/headless-check.sh checks that what is left enables, disables and
// re-enables without leaking. It presses no keys and asserts no geometry, so it
// is a lifetime check, not evidence that a placement is correct.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ACTIONS } from './actions.js';
import { isFocusable, isPlaceable } from './windows.js';
import {
    MATCH_TOLERANCE,
    matchZone,
    nextZone,
    projectZone,
    zoneById,
} from './zones.js';

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
        this._gap = settings.get_int('gap');
        this._gapChangedId = 0;
        this._bindings = [];
    }

    /** Register every keybinding. */
    enable() {
        // Cached, not read per keypress. gTile hits GSettings several times per
        // placement and re-parses its preset strings on every press.
        //
        // Connected here rather than in the constructor so that it pairs with
        // the disconnect in disable(). A connect that outlives its disconnect is
        // precisely the leak this extension exists not to have.
        this._gap = this._settings.get_int('gap');
        this._gapChangedId = this._settings.connect('changed::gap', () => {
            this._gap = this._settings.get_int('gap');
        });

        const bind = (key, handler) => {
            // addKeybinding returns NONE when registration fails, which happens
            // when two actions have been given the same accelerator. Recording a
            // key that was never registered makes disable() call
            // removeKeybinding on it, and the Shell warns.
            const action = Main.wm.addKeybinding(
                key,
                this._settings,
                // Holding a tile key must not race through the whole cycle.
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL,
                handler,
            );

            if (action === Meta.KeyBindingAction.NONE) {
                console.warn(`[tiler] could not bind ${key}; is it already in use?`);
                return;
            }

            this._bindings.push(key);
        };

        // Keyed by the same strings modules/actions.js and the gschema use, and
        // driven from that list rather than from a second one written out here.
        // A Map rather than an object literal for the reason given in
        // modules/zones.js: a bare index resolves inherited keys.
        const handlers = new Map([
            ['tile-left', () => this._tile('left')],
            ['tile-right', () => this._tile('right')],
            ['tile-center', () => this._tile('center')],
            ['tile-maximize', () => this._toggleMaximize()],
            ['focus-left', () => this._focusNeighbour(-1)],
            ['focus-right', () => this._focusNeighbour(1)],
            ['swap-left', () => this._swapNeighbour(-1)],
            ['swap-right', () => this._swapNeighbour(1)],
            ['move-monitor-next', () => this._moveToNextMonitor()],
        ]);

        for (const { key } of ACTIONS) {
            const handler = handlers.get(key);

            // tests/actions.test.js keeps ACTIONS and the gschema in step, but
            // nothing off-Shell can check this map, so say so loudly rather than
            // leaving a shortcut that is configurable and silently inert.
            if (!handler) {
                console.warn(`[tiler] no handler for action ${key}`);
                continue;
            }

            bind(key, handler);
        }
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
     * The focused window, if it satisfies a policy.
     *
     * @param {Function} accepts Predicate from modules/windows.js.
     * @returns {Meta.Window|null} The focused window, or null.
     */
    _focused(accepts) {
        const window = global.display.get_focus_window();
        return accepts(describe(window)) ? window : null;
    }

    /**
     * The work area of the monitor a window is on.
     *
     * Panel and dock struts are already excluded by Mutter, and reading it per
     * monitor is what makes multi-monitor support fall out for free.
     *
     * get_workspace() is nullable — it returns null for a window that is
     * unmanaging, and briefly while one is being created — so a keypress that
     * lands on such a window would otherwise throw out of the handler.
     *
     * @param {Meta.Window} window Window to locate.
     * @param {number} [monitor] Monitor to read, defaulting to the window's own.
     * @returns {Mtk.Rectangle|null} Work area, or null if the window has no workspace.
     */
    _workArea(window, monitor = window.get_monitor()) {
        const workspace = window.get_workspace();
        return workspace ? workspace.get_work_area_for_monitor(monitor) : null;
    }

    /**
     * Which zone a window currently occupies, read back from its geometry.
     *
     * @param {Meta.Window} window Window to inspect.
     * @param {{x: number, y: number, width: number, height: number}} workArea
     *   Work area to measure against, passed in so that a caller which also
     *   places the window does not read it from Mutter twice.
     * @returns {string|null} Zone id, or null if it is in none.
     */
    _currentZone(window, workArea) {
        return matchZone(window.get_frame_rect(), workArea, this._gap, MATCH_TOLERANCE);
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
        this._unmaximize(window);
        window.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);
    }

    /**
     * Drop any maximized state, so that a frame resize takes effect.
     *
     * Tests the disjunction: a window maximized in only one direction still
     * ignores a resize along that axis. _toggleMaximize deliberately tests the
     * conjunction instead, for a different reason given there.
     *
     * @param {Meta.Window} window Window to unmaximize.
     */
    _unmaximize(window) {
        if (window.maximized_horizontally || window.maximized_vertically) {
            window.set_unmaximize_flags(Meta.MaximizeFlags.BOTH);
            window.unmaximize();
        }
    }

    /**
     * Place a window into a zone.
     *
     * @param {Meta.Window} window Window to place.
     * @param {string|null} zoneId Zone id.
     * @param {{x: number, y: number, width: number, height: number}} workArea
     *   Work area to project onto. Passed in rather than read here so that it
     *   can be the destination monitor's, which is what makes moving a window
     *   between monitors keep its zone.
     */
    _place(window, zoneId, workArea) {
        const zone = zoneById(zoneId);
        if (!zone) return;

        this._moveResize(window, projectZone(zone, workArea, this._gap));
    }

    /**
     * Advance the focused window through a direction's zone cycle.
     *
     * @param {string} group Cycle to walk: 'left', 'right' or 'center'.
     */
    _tile(group) {
        const window = this._focused(isPlaceable);
        if (!window) return;

        const workArea = this._workArea(window);
        if (!workArea) return;

        this._place(
            window,
            nextZone(this._currentZone(window, workArea), group),
            workArea,
        );
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
        const window = this._focused(isPlaceable);
        if (!window) return;

        // The conjunction, where _unmaximize uses the disjunction: a window
        // maximized in only one direction should finish maximizing rather than
        // restore, which is what GNOME's own maximize key does.
        if (window.maximized_horizontally && window.maximized_vertically)
            this._unmaximize(window);
        else window.maximize();
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

        const workspace = window.get_workspace();
        if (!workspace) return null;

        let best = null;
        let bestDistance = Infinity;

        for (const other of workspace.list_windows()) {
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
        const window = this._focused(isFocusable);
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
        const window = this._focused(isPlaceable);
        if (!window) return;

        const neighbour = this._neighbour(window, direction, isPlaceable);
        if (!neighbour) return;

        // Unmaximize both before reading their geometry. A maximized window's
        // frame rect is the entire work area, so capturing it first would hand
        // the neighbour a work-area-sized frame with no maximized flag: it looks
        // maximized, Mutter's own restore no longer applies to it, and matchZone
        // reports no zone for it at all. isPlaceable admits maximized windows by
        // design, so this path is reachable.
        this._unmaximize(window);
        this._unmaximize(neighbour);

        const from = window.get_frame_rect();
        const to = neighbour.get_frame_rect();

        this._moveResize(window, to);
        this._moveResize(neighbour, from);
    }

    /** Move the focused window to the next monitor, keeping its zone. */
    _moveToNextMonitor() {
        const window = this._focused(isPlaceable);
        if (!window) return;

        const count = Main.layoutManager.monitors.length;
        if (count < 2) return;

        // Read the zone before the move: afterwards the window is measured
        // against a different work area and would no longer match.
        const source = this._workArea(window);
        if (!source) return;

        const zoneId = this._currentZone(window, source);
        const target = (window.get_monitor() + 1) % count;

        window.move_to_monitor(target);

        // Project against the destination's work area directly: re-reading
        // get_monitor() here would depend on Mutter having already applied the
        // move, and a stale read would snap the window back to where it came
        // from.
        const destination = this._workArea(window, target);
        if (!destination) return;

        this._place(window, zoneId, destination);
    }
}
