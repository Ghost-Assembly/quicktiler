// Shell layer: the only file in QuickTiler that touches Meta, Shell or Main.
//
// Everything here needs a live gnome-shell, so none of it is unit-testable off
// the Shell. That is why it is kept thin and free of branching logic: geometry
// and cycling live in modules/zones.js, the rules about which windows may be
// touched live in modules/windows.js, choosing a neighbor lives in
// modules/neighbors.js, and the action list lives in modules/actions.js. All
// four import nothing and are covered by Vitest.
//
// scripts/headless-check.sh checks that what is left enables, disables and
// re-enables without leaking. It presses no keys and asserts no geometry, so it
// is a lifetime check, not evidence that a placement is correct.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ACTIONS, ACTIONS_BY_KEY } from './actions.js';
import { nearestNeighbor } from './neighbors.js';
import { KEYS, SettingsWatcher } from './settings.js';
import { isFocusable, isPlaceable } from './windows.js';
import { matchZone, nextZone, projectZone, zoneById } from './zones.js';

/**
 * The facts isFocusable needs, and nothing more.
 *
 * Split out from {@link describe} because _neighbor calls this for every
 * window on the workspace: on the focus path the four placement facts below are
 * read and thrown away, and allows_resize() in particular is not a plain getter
 * in Mutter.
 *
 * @param {Meta.Window|null} window Window to describe.
 * @returns {object|null} Partial description, or null.
 */
function describeManageable(window) {
    if (!window) return null;

    return {
        normal: window.get_window_type() === Meta.WindowType.NORMAL,
        overrideRedirect: window.is_override_redirect(),
        skipTaskbar: window.is_skip_taskbar(),
    };
}

/**
 * Read the facts modules/windows.js needs off a Meta.Window.
 *
 * @param {Meta.Window|null} window Window to describe.
 * @returns {object|null} Plain description, or null.
 */
function describe(window) {
    const manageable = describeManageable(window);
    if (!manageable) return null;

    return {
        ...manageable,
        fullscreen: window.is_fullscreen(),
        maximized: window.is_maximized(),
        allowsMove: window.allows_move(),
        allowsResize: window.allows_resize(),
    };
}

/**
 * A window policy: the rule, and the facts that rule needs read off Mutter.
 *
 * Paired as one value rather than recovered at the call site. isFocusable
 * consults only the manageability facts, so reading the placement ones is
 * wasted work on the focus path — but that is a fact about the policy, and
 * testing `accepts === isFocusable` to rediscover it silently picks the wrong
 * reader for any predicate that is ever wrapped or composed, with no failure to
 * notice: the extra facts are unused rather than wrong.
 *
 * @type {Readonly<{accepts: Function, read: Function}>}
 */
const FOCUS = Object.freeze({ accepts: isFocusable, read: describeManageable });

/** The placement policy; see {@link FOCUS}. */
const PLACE = Object.freeze({ accepts: isPlaceable, read: describe });

/** Places windows into zones in response to keybindings. */
export class QuickTiler {
    /**
     * @param {Gio.Settings} settings The extension's settings, which also hold
     *   the keybinding arrays.
     */
    constructor(settings) {
        this._settings = settings;
        this._gap = settings.get_int(KEYS.GAP);
        this._watches = new SettingsWatcher(settings);
        this._bindings = [];
        this._bound = false;

        // One entry per operation in modules/actions.js's OPERATIONS, not one
        // per action: the ten actions are five behaviors and an argument, and
        // which action carries which argument is that file's business, not
        // this one's. What is left here is the part that needs a live Shell.
        //
        // Each operation declares the policy its window must satisfy, so run()
        // can resolve the window once instead of every operation opening with
        // the same two-line prologue.
        //
        // Built here rather than in enable() because the closures capture
        // `this`. A Map rather than an object literal for the reason given in
        // modules/zones.js: a bare index resolves inherited keys.
        this._operations = new Map([
            [
                'tile',
                { policy: PLACE, run: (window, cycle) => this._tile(window, cycle) },
            ],
            [
                'maximize',
                { policy: PLACE, run: window => this._toggleMaximize(window) },
            ],
            [
                'focus',
                {
                    policy: FOCUS,
                    run: (window, direction) => this._focusNeighbor(window, direction),
                },
            ],
            [
                'swap',
                {
                    policy: PLACE,
                    run: (window, direction) => this._swapNeighbor(window, direction),
                },
            ],
            [
                'monitor',
                {
                    policy: PLACE,
                    run: (window, direction) => this._moveToMonitor(window, direction),
                },
            ],
        ]);
    }

    /**
     * Whether the keybindings are currently registered with Mutter.
     *
     * @returns {boolean} True between bindKeys() and unbindKeys().
     */
    get bound() {
        return this._bound;
    }

    /**
     * Perform one action, as a keypress or a menu row would.
     *
     * `target` exists for the quick settings menu. Opening it takes a Clutter
     * grab, and Mutter's focus window can be null for as long as the grab is
     * held — so a menu row that relied on reading the display could silently do
     * nothing, which is the failure mode modules/windows.js exists to avoid.
     * The Panel passes the window it last saw focused instead. It is an
     * argument rather than a field so it cannot outlive the call: the target
     * still goes through the same policy as a focused window, so a window that
     * has since closed is rejected exactly as one that was never eligible.
     *
     * @param {string} key Schema key of the action, as modules/actions.js spells it.
     * @param {Meta.Window|null} [target] Window to act on, or null to use the
     *   focused one.
     * @returns {boolean} False if no such action exists.
     */
    run(key, target = null) {
        const action = ACTIONS_BY_KEY.get(key);
        const operation = action && this._operations.get(action.op);

        if (!operation) {
            console.warn(`[quicktiler] no handler for action ${key}`);
            return false;
        }

        // Resolved once, here. Every operation used to open by asking for the
        // focused window and returning if there was none, which is a guard the
        // sixth one would have had to remember.
        const window = this._focused(operation.policy, target);
        if (window) operation.run(window, action.arg);

        return true;
    }

    /** Watch the settings, and register every keybinding unless paused. */
    enable() {
        // Cached, not read per keypress. gTile hits GSettings several times per
        // placement and re-parses its preset strings on every press.
        //
        // Connected here rather than in the constructor so that it pairs with
        // the disconnect in disable(). A connect that outlives its disconnect is
        // precisely the leak this extension exists not to have.
        this._gap = this._settings.get_int(KEYS.GAP);
        this._watches.watch(KEYS.GAP, () => {
            this._gap = this._settings.get_int(KEYS.GAP);
        });

        // The pause is watched here rather than driven from modules/panel.js,
        // and that is not a preference. With show-quick-settings off there is
        // no panel at all, and the preferences window's shortcuts switch would
        // then be configurable and completely inert — the silent failure this
        // extension is organized around not having. The panel only ever writes
        // the key; this reacts to it.
        //
        // Connected before the first read, so a change racing the connect
        // cannot be missed.
        this._watches.watch(KEYS.SHORTCUTS_ENABLED, () => this._syncShortcuts());

        this._syncShortcuts();
    }

    /** Bind or unbind, to match the shortcuts-enabled key. */
    _syncShortcuts() {
        if (this._settings.get_boolean(KEYS.SHORTCUTS_ENABLED)) this.bindKeys();
        else this.unbindKeys();
    }

    /**
     * Register every keybinding.
     *
     * Idempotent, because the tile can be clicked twice faster than anyone can
     * think about it. The guard is a flag rather than `this._bindings.length`:
     * only keys Mutter accepted are recorded there, so if every name were
     * refused it would stay empty while the bindings are conceptually
     * registered, and a length check would re-run the whole loop and re-warn
     * on every unpause.
     */
    bindKeys() {
        if (this._bound) return;
        this._bound = true;

        const bind = (key, handler) => {
            // addKeybinding returns NONE when registration fails, which happens
            // when a keybinding of the same *name* is already registered —
            // another extension that also calls one 'focus-left', say. It is
            // not how a shared accelerator shows up: two names given the same
            // combination both register, and Mutter indexes one over the other
            // with a warning of its own. Recording a key that was never
            // registered makes disable() call removeKeybinding on it, and the
            // Shell warns.
            const action = Main.wm.addKeybinding(
                key,
                this._settings,
                // Holding a tile key must not race through the whole cycle.
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL,
                handler,
            );

            if (action === Meta.KeyBindingAction.NONE) {
                console.warn(
                    `[quicktiler] could not bind ${key}; is a keybinding with that name already registered?`,
                );
                return;
            }

            this._bindings.push(key);
        };

        for (const { key, op } of ACTIONS) {
            // tests/actions.test.js now keeps every action's `op` inside
            // OPERATIONS and tests/quicktiler.test.js keeps this map covering
            // all of them, so this is no longer the only guard — but an action
            // nothing can perform should still be reported when it is
            // registered rather than only when someone presses it.
            if (!this._operations.has(op)) {
                console.warn(`[quicktiler] no handler for action ${key}`);
                continue;
            }

            bind(key, () => this.run(key));
        }
    }

    /** Release every keybinding. Idempotent, for the reason bindKeys() gives. */
    unbindKeys() {
        for (const key of this._bindings) Main.wm.removeKeybinding(key);
        this._bindings = [];
        this._bound = false;
    }

    /**
     * Release every keybinding and signal.
     *
     * Every watch goes through one SettingsWatcher, so releasing them is one
     * call that cannot leave a key behind. gTile leaks here: it connects to
     * `layoutManager.overviewGroup` but disconnects from `layoutManager`, so
     * its handler survives disable.
     */
    disable() {
        this.unbindKeys();
        this._watches.release();
    }

    /**
     * The focused window, if it satisfies a policy.
     *
     * @param {{accepts: Function, read: Function}} policy FOCUS or PLACE.
     * @param {Meta.Window|null} [target] Window to use instead of the focused
     *   one; see run().
     * @returns {Meta.Window|null} The window, or null if it satisfies no policy.
     */
    _focused(policy, target = null) {
        const window = target ?? global.display.get_focus_window();
        return policy.accepts(policy.read(window)) ? window : null;
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
     * get_monitor() is -1 for a window with no monitor, which is what a window
     * being unmanaged has (meta_window_get_monitor in window.c), and
     * get_work_area_for_monitor fails a g_return_if_fail for it rather than
     * answering anything usable. So that is a no-op too.
     *
     * @param {Meta.Window} window Window to locate.
     * @param {number} [monitor] Monitor to read, defaulting to the window's own.
     * @returns {Mtk.Rectangle|null} Work area, or null if the window has no
     *   workspace or no monitor.
     */
    _workArea(window, monitor = window.get_monitor()) {
        if (monitor < 0) return null;

        const workspace = window.get_workspace();
        return workspace ? workspace.get_work_area_for_monitor(monitor) : null;
    }

    /**
     * Which zone a window currently occupies, read back from its geometry.
     *
     * A maximized window is in none. Its frame is the work area, and as the
     * largest frame anchored at the work area's corner, matchZone's anchor
     * match — meant for windows enlarged to their minimum size — would read
     * it as enlarged from left-quarter.
     *
     * @param {Meta.Window} window Window to inspect.
     * @param {{x: number, y: number, width: number, height: number}} workArea
     *   Work area to measure against, passed in so that a caller which also
     *   places the window does not read it from Mutter twice.
     * @returns {string|null} Zone id, or null if it is in none.
     */
    _currentZone(window, workArea) {
        if (window.is_maximized()) return null;

        return matchZone(window.get_frame_rect(), workArea, this._gap);
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
     * unmaximize() alone is enough. In Mutter 17 and 18 (GNOME 49 and 50) it is
     * set_unmaximize_flags(BOTH), so calling both did the work twice.
     *
     * @param {Meta.Window} window Window to unmaximize.
     */
    _unmaximize(window) {
        if (window.maximized_horizontally || window.maximized_vertically)
            window.unmaximize();
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
     * Advance a window through a direction's zone cycle.
     *
     * @param {Meta.Window} window Window to place, already policy-checked.
     * @param {string} cycle Cycle to walk: 'left', 'right' or 'center'.
     */
    _tile(window, cycle) {
        const workArea = this._workArea(window);
        if (!workArea) return;

        this._place(
            window,
            nextZone(this._currentZone(window, workArea), cycle),
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
     *
     * @param {Meta.Window} window Window to maximize, already policy-checked.
     */
    _toggleMaximize(window) {
        // is_maximized() is the conjunction — both directions, in Mutter 17
        // and 18 alike — where _unmaximize uses the disjunction: a window
        // maximized in only one direction should finish maximizing rather than
        // restore, which is what GNOME's own maximize key does.
        if (window.is_maximized()) this._unmaximize(window);
        else window.maximize();
    }

    /**
     * The nearest window to one side of the focused window.
     *
     * Gathers eligible windows and hands the choice to modules/neighbors.js,
     * which is unit-tested. Nothing is decided here.
     *
     * Candidates are not restricted to the current monitor. Frame rects are in
     * absolute coordinates, so a monitor to the right simply contains windows
     * further right, and both focus and swap fall out of that: a swapped window
     * takes the neighbor's rect, which lies on the neighbor's monitor, and
     * Mutter reassigns the monitor from the new geometry.
     *
     * @param {Meta.Window} window Window to search from.
     * @param {number} direction -1 for left, 1 for right.
     * @param {{accepts: Function, read: Function}} policy Policy a candidate
     *   must satisfy; its reader is what each candidate is described with.
     * @returns {Meta.Window|null} The neighbor, if there is one.
     */
    _neighbor(window, direction, policy) {
        const workspace = window.get_workspace();
        if (!workspace) return null;

        const candidates = [];

        for (const other of workspace.list_windows()) {
            if (other === window) continue;
            if (other.minimized) continue;
            if (!policy.accepts(policy.read(other))) continue;

            candidates.push({
                window: other,
                rect: other.get_frame_rect(),
                // Stable across keypresses, where list_windows() order is not.
                seq: other.get_stable_sequence(),
            });
        }

        return (
            nearestNeighbor(window.get_frame_rect(), candidates, direction)?.window ??
            null
        );
    }

    /**
     * Move focus to the neighboring window without moving anything.
     *
     * @param {Meta.Window} window Window to search from, already policy-checked.
     * @param {number} direction -1 for left, 1 for right.
     */
    _focusNeighbor(window, direction) {
        const neighbor = this._neighbor(window, direction, FOCUS);
        if (neighbor) Main.activateWindow(neighbor);
    }

    /**
     * Exchange a window's geometry with its neighbor's.
     *
     * @param {Meta.Window} window Window to swap, already policy-checked.
     * @param {number} direction -1 for left, 1 for right.
     */
    _swapNeighbor(window, direction) {
        const neighbor = this._neighbor(window, direction, PLACE);
        if (!neighbor) return;

        // Everything is read before anything changes. On Wayland, unmaximize()
        // and move_resize_frame() only send the client a configure; the frame
        // rect changes when the client commits, which is after this handler
        // has returned. Reading a rect after unmaximizing therefore answers
        // the maximized frame — the whole work area — and handing that to the
        // neighbor gives it a frame that looks maximized, carries no maximized
        // flag, escapes Mutter's restore and matches no zone. isPlaceable
        // admits maximized windows by design, so this path is reachable.
        const from = this._slot(window);
        const to = this._slot(neighbor);

        this._occupy(window, to);
        this._occupy(neighbor, from);
    }

    /**
     * Where a window is, in the terms _occupy needs to put another one there.
     *
     * @param {Meta.Window} window Window to read.
     * @returns {{rect: object, maximized: boolean, monitor: number}} Its slot.
     */
    _slot(window) {
        return {
            rect: window.get_frame_rect(),
            maximized: window.is_maximized(),
            monitor: window.get_monitor(),
        };
    }

    /**
     * Put a window where another one was.
     *
     * A maximized slot is taken by maximizing, on that slot's monitor, rather
     * than by copying its rect: the rect of a maximized window is its work
     * area, not a geometry anything else should be given, and maximizing keeps
     * Mutter's own restore working for the window that arrives.
     *
     * @param {Meta.Window} window Window to move.
     * @param {{rect: object, maximized: boolean, monitor: number}} slot Where
     *   it goes, from {@link _slot}.
     */
    _occupy(window, slot) {
        if (!slot.maximized) {
            this._moveResize(window, slot.rect);
            return;
        }

        if (slot.monitor >= 0 && slot.monitor !== window.get_monitor())
            window.move_to_monitor(slot.monitor);
        window.maximize();
    }

    /**
     * Move a window to an adjacent monitor, keeping its zone.
     *
     * @param {Meta.Window} window Window to move, already policy-checked.
     * @param {number} direction 1 for the next monitor, -1 for the previous.
     */
    _moveToMonitor(window, direction) {
        const count = Main.layoutManager.monitors.length;
        if (count < 2) return;

        // Read the zone before the move: afterwards the window is measured
        // against a different work area and would no longer match.
        //
        // Returning here also covers a window with no monitor, which
        // _workArea answers null for: Mutter's move_to_monitor reads the
        // window's current monitor unchecked.
        const source = this._workArea(window);
        if (!source) return;

        const zoneId = this._currentZone(window, source);

        // The addend keeps the operand positive; JavaScript's % returns a
        // negative remainder for a negative left-hand side, which would index
        // off the end of the monitor list going left from the first one.
        const target = (window.get_monitor() + direction + count) % count;

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
