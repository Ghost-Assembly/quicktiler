import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Meta from 'gi://Meta';

import { ACTIONS, ACTION_KEYS, OPERATIONS } from '../modules/actions.js';
import { QuickTiler } from '../modules/quicktiler.js';
import { KEYS } from '../modules/settings.js';
import { projectZone, zoneById } from '../modules/zones.js';
import * as Main from './stubs/shell-main.js';
import { FakeWindow, createSettings, createWorld } from './support/world.js';

const WIDE = { x: 0, y: 0, width: 1920, height: 1080 };
const SECOND = { x: 1920, y: 0, width: 1280, height: 1024 };
const GAP = 8;

/** The rectangle a zone projects to on the primary work area. */
const zone = (id, workArea = WIDE, gap = GAP) =>
    projectZone(zoneById(id), workArea, gap);

describe('QuickTiler', () => {
    let settings;
    let quicktiler;
    let world;

    /**
     * Build a world, a QuickTiler and enable it.
     *
     * @param {Array<object>} [workAreas] One work area per monitor.
     * @returns {object} The world.
     */
    const start = (workAreas = [WIDE]) => {
        world = createWorld(workAreas);
        quicktiler = new QuickTiler(settings);
        quicktiler.enable();
        return world;
    };

    beforeEach(() => {
        Main.reset();
        settings = createSettings({ [KEYS.GAP]: GAP });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('enable and disable', () => {
        it('registers each action with autorepeat ignored', () => {
            start();

            expect([...Main.registered.keys()].sort()).toEqual([...ACTION_KEYS].sort());
            for (const call of Main.addCalls) {
                expect(call.flags).toBe(Meta.KeyBindingFlags.IGNORE_AUTOREPEAT);
                expect(call.settings).toBe(settings);
            }
        });

        // Mutter returns KeyBindingAction.NONE when two actions share an
        // accelerator. Recording the key anyway made disable() call
        // removeKeybinding on a binding that was never registered.
        it('does not track a keybinding Mutter refused', () => {
            Main.refuse.add('tile-left');
            start();
            quicktiler.disable();

            expect(Main.removeCalls).not.toContain('tile-left');
            expect(Main.removeCalls.sort()).toEqual(
                ACTION_KEYS.filter(k => k !== 'tile-left').sort(),
            );
        });

        it('warns when a keybinding is refused', () => {
            Main.refuse.add('swap-right');
            start();

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('could not bind swap-right'),
            );
        });

        it('binds nothing when shortcuts are paused', () => {
            settings = createSettings({
                [KEYS.GAP]: GAP,
                [KEYS.SHORTCUTS_ENABLED]: false,
            });
            start();

            expect(Main.registered.size).toBe(0);
            expect(quicktiler.bound).toBe(false);
        });

        it('releases every keybinding when the pause is set', () => {
            start();
            expect(quicktiler.bound).toBe(true);

            settings.set_boolean(KEYS.SHORTCUTS_ENABLED, false);

            expect(Main.registered.size).toBe(0);
            expect(Main.removeCalls.sort()).toEqual([...ACTION_KEYS].sort());
            expect(quicktiler.bound).toBe(false);
        });

        it('registers them again when the pause is lifted', () => {
            start();
            settings.set_boolean(KEYS.SHORTCUTS_ENABLED, false);
            settings.set_boolean(KEYS.SHORTCUTS_ENABLED, true);

            expect([...Main.registered.keys()].sort()).toEqual([...ACTION_KEYS].sort());
            expect(Main.addCalls).toHaveLength(ACTION_KEYS.length * 2);
            expect(quicktiler.bound).toBe(true);
        });

        it('binds once however often bindKeys is called', () => {
            start();
            quicktiler.bindKeys();
            quicktiler.bindKeys();

            expect(Main.addCalls).toHaveLength(ACTION_KEYS.length);
        });

        it('unbinds once however often unbindKeys is called', () => {
            start();
            quicktiler.unbindKeys();
            quicktiler.unbindKeys();

            expect(Main.removeCalls).toHaveLength(ACTION_KEYS.length);
        });

        // The idempotence guard cannot be `_bindings.length`: only accelerators
        // Mutter accepted are recorded there, so someone who has given every
        // action a colliding shortcut would leave it empty while the bindings
        // are registered, and every unpause would re-run the loop and re-warn.
        it('does not re-warn on unpause when Mutter refused everything', () => {
            for (const key of ACTION_KEYS) Main.refuse.add(key);
            start();
            const warnings = console.warn.mock.calls.length;

            quicktiler.bindKeys();

            expect(console.warn.mock.calls).toHaveLength(warnings);
        });

        it('disconnects both settings handlers on disable', () => {
            start();
            // The gap watch and the shortcuts-enabled watch.
            expect(settings.connected.size).toBe(2);

            quicktiler.disable();
            expect(settings.connected.size).toBe(0);
        });

        // The handler used to be connected in the constructor and disconnected
        // in disable(), so a second enable() on one instance lost gap tracking.
        it('still tracks the gap after a disable and a second enable', () => {
            start();
            quicktiler.disable();
            quicktiler.enable();
            settings.emitChange(KEYS.GAP, 40);

            const window = world.workspace.add(new FakeWindow())[0];
            world.focus(window);
            Main.press('tile-left');

            expect(window.get_frame_rect()).toEqual(zone('left-quarter', WIDE, 40));
        });

        it('picks up a gap change without being re-enabled', () => {
            start();
            settings.emitChange(KEYS.GAP, 0);

            const window = world.workspace.add(new FakeWindow())[0];
            world.focus(window);
            Main.press('tile-left');

            expect(window.get_frame_rect()).toEqual(zone('left-quarter', WIDE, 0));
        });
    });

    describe('run', () => {
        // The other half of the guard tests/actions.test.js holds up. That file
        // proves every action names an operation modules/actions.js declares;
        // this proves the Shell layer actually implements each of them, so an
        // action can no longer be bindable and inert.
        it('accepts every action in the shared list', () => {
            start();

            for (const key of ACTION_KEYS) expect(quicktiler.run(key)).toBe(true);

            expect(console.warn).not.toHaveBeenCalled();
        });

        it('implements every operation the action list declares', () => {
            start();
            const performed = new Set();

            for (const action of ACTIONS)
                if (quicktiler.run(action.key)) performed.add(action.op);

            expect([...performed].sort()).toEqual([...OPERATIONS].sort());
        });

        it('performs the action a keypress would', () => {
            const world = start();
            const window = world.workspace.add(new FakeWindow())[0];
            world.focus(window);

            expect(quicktiler.run('tile-left')).toBe(true);
            expect(window.moves.at(-1)).toMatchObject(zone('left-quarter'));
        });

        it('works while shortcuts are paused, because the pause is the keyboard', () => {
            const world = start();
            settings.set_boolean(KEYS.SHORTCUTS_ENABLED, false);
            const window = world.workspace.add(new FakeWindow())[0];
            world.focus(window);

            expect(quicktiler.run('tile-left')).toBe(true);
            expect(window.moves).toHaveLength(1);
        });

        // The quick settings menu holds a Clutter grab while it is open, and
        // Mutter's focus window can be null for the duration. A menu row that
        // relied on the display would silently do nothing.
        it('acts on the target it was given rather than the focused window', () => {
            const world = start();
            const [focused, target] = world.workspace.add(
                new FakeWindow(),
                new FakeWindow(),
            );
            world.focus(focused);

            quicktiler.run('tile-right', target);

            expect(target.moves).toHaveLength(1);
            expect(focused.moves).toHaveLength(0);
        });

        it('acts on the target even when nothing is focused at all', () => {
            const world = start();
            const target = world.workspace.add(new FakeWindow())[0];
            world.focus(null);

            quicktiler.run('tile-left', target);

            expect(target.moves.at(-1)).toMatchObject(zone('left-quarter'));
        });

        it('applies the same window policy to a target as to a focused window', () => {
            const world = start();
            const target = world.workspace.add(new FakeWindow({ fullscreen: true }))[0];

            quicktiler.run('tile-left', target);

            expect(target.moves).toHaveLength(0);
        });

        it('does not leave the target standing in for the next keypress', () => {
            const world = start();
            const [focused, target] = world.workspace.add(
                new FakeWindow(),
                new FakeWindow(),
            );
            world.focus(focused);

            quicktiler.run('tile-left', target);
            Main.press('tile-left');

            expect(focused.moves).toHaveLength(1);
            expect(target.moves).toHaveLength(1);
        });

        it('warns and reports failure for an action it cannot perform', () => {
            start();

            expect(quicktiler.run('tile-diagonally')).toBe(false);
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('no handler for action tile-diagonally'),
            );
        });
    });

    describe('tiling', () => {
        /** Focus a fresh ordinary window on the primary monitor. */
        const focusOne = (options = {}) => {
            const window = world.workspace.add(new FakeWindow(options))[0];
            world.focus(window);
            return window;
        };

        it('places an untiled window at the head of the cycle', () => {
            start();
            const window = focusOne();

            Main.press('tile-left');
            expect(window.get_frame_rect()).toEqual(zone('left-quarter'));
        });

        it('advances through the left cycle and wraps', () => {
            start();
            const window = focusOne();

            Main.press('tile-left');
            expect(window.get_frame_rect()).toEqual(zone('left-quarter'));
            Main.press('tile-left');
            expect(window.get_frame_rect()).toEqual(zone('left-half'));
            Main.press('tile-left');
            expect(window.get_frame_rect()).toEqual(zone('left-quarter'));
        });

        it('walks the three center zones in order', () => {
            start();
            const window = focusOne();

            for (const id of ['center-half', 'center-top', 'center-bottom']) {
                Main.press('tile-center');
                expect(window.get_frame_rect()).toEqual(zone(id));
            }
        });

        it('enters the head of a cycle when the window is in a foreign zone', () => {
            start();
            const window = focusOne();

            Main.press('tile-right');
            expect(window.get_frame_rect()).toEqual(zone('right-quarter'));
            Main.press('tile-left');
            expect(window.get_frame_rect()).toEqual(zone('left-quarter'));
        });

        // Mutter enlarges a frame to the client's minimum size, keeping the
        // origin. center-top is about 350 pixels tall here, so a window with a
        // taller minimum never matched it exactly, read as untiled, and went
        // back to the head of the cycle on every press.
        it('walks the center cycle for a window taller than a third', () => {
            start();
            const window = focusOne({ minSize: { width: 0, height: 500 } });
            const origins = [];

            for (let press = 0; press < 4; press += 1) {
                Main.press('tile-center');
                const { x, y } = window.get_frame_rect();
                origins.push({ x, y });
            }

            const at = id => ({ x: zone(id).x, y: zone(id).y });
            expect(origins).toEqual([
                at('center-half'),
                at('center-top'),
                at('center-bottom'),
                at('center-half'),
            ]);
            expect(window.get_frame_rect().height).toBe(zone('center-half').height);
            expect(window.moves.at(-2).height).toBe(zone('center-bottom').height);
        });

        it('walks the left cycle for a window wider than a quarter', () => {
            start();
            const window = focusOne({ minSize: { width: 600, height: 0 } });

            Main.press('tile-left');
            expect(window.get_frame_rect().width).toBe(600);
            Main.press('tile-left');
            expect(window.get_frame_rect()).toEqual(zone('left-half'));
            Main.press('tile-left');
            expect(window.moves.at(-1)).toMatchObject(zone('left-quarter'));
        });

        it('treats a maximized window as in no zone, whatever its frame', () => {
            start();
            const window = focusOne({ maximized: true });

            Main.press('tile-left');

            expect(window.get_frame_rect()).toEqual(zone('left-quarter'));
        });

        it('unmaximizes before placing, so the frame resize takes effect', () => {
            start();
            const window = focusOne({ maximized: true });

            Main.press('tile-left');

            expect(window.is_maximized()).toBe(false);
            expect(window.maximized_vertically).toBe(false);
            expect(window.unmaximizeCalls).toBe(1);
            expect(window.get_frame_rect()).toEqual(zone('left-quarter'));
        });

        it.each([
            ['is fullscreen', { fullscreen: true }],
            ['cannot be moved', { canMove: false }],
            ['cannot be resized', { canResize: false }],
            ['is not a normal window', { type: Meta.WindowType.DIALOG }],
            ['is override-redirect', { overrideRedirect: true }],
            ['is hidden from the taskbar', { skipTaskbar: true }],
        ])('leaves a window that %s alone', (_reason, options) => {
            start();
            const window = focusOne(options);

            Main.press('tile-left');
            expect(window.moves).toHaveLength(0);
        });

        it('does nothing when no window has focus', () => {
            start();
            world.focus(null);

            expect(() => Main.press('tile-left')).not.toThrow();
        });

        // get_workspace() is null for an unmanaging window; this used to throw
        // out of the keybinding handler.
        it('does not throw for a window with no workspace', () => {
            start();
            const orphan = new FakeWindow();
            world.focus(orphan);

            expect(() => Main.press('tile-left')).not.toThrow();
            expect(orphan.moves).toHaveLength(0);
        });
    });

    // Mutter's get_monitor() answers -1 for a window with no monitor, which is
    // what a window being unmanaged has. Passing that to
    // get_work_area_for_monitor fails a g_return_if_fail in Mutter.
    describe('a window with no monitor', () => {
        it('is not tiled', () => {
            start();
            const window = world.workspace.add(new FakeWindow({ monitor: -1 }))[0];
            world.focus(window);

            expect(() => Main.press('tile-left')).not.toThrow();
            expect(window.moves).toHaveLength(0);
        });

        it('is not moved to another monitor', () => {
            start([WIDE, SECOND]);
            const window = world.workspace.add(new FakeWindow({ monitor: -1 }))[0];
            world.focus(window);

            expect(() => Main.press('move-monitor-next')).not.toThrow();
            expect(window.get_monitor()).toBe(-1);
            expect(window.moves).toHaveLength(0);
        });
    });

    describe('maximize toggle', () => {
        it('maximizes an ordinary window through Mutter, not a zone', () => {
            start();
            const window = world.workspace.add(new FakeWindow())[0];
            world.focus(window);

            Main.press('tile-maximize');

            expect(window.maximized_horizontally).toBe(true);
            expect(window.maximized_vertically).toBe(true);
            expect(window.moves).toHaveLength(0);
        });

        it('restores a maximized window to its previous geometry', () => {
            start();
            const rect = { x: 300, y: 200, width: 640, height: 480 };
            const window = world.workspace.add(new FakeWindow({ rect }))[0];
            world.focus(window);

            Main.press('tile-maximize');
            Main.press('tile-maximize');

            expect(window.maximized_horizontally).toBe(false);
            expect(window.get_frame_rect()).toEqual(rect);
        });

        it('finishes maximizing a window maximized in only one direction', () => {
            start();
            const window = world.workspace.add(new FakeWindow())[0];
            window.maximized_horizontally = true;
            world.focus(window);

            Main.press('tile-maximize');

            expect(window.maximized_vertically).toBe(true);
        });
    });

    describe('focus navigation', () => {
        it('moves focus to the nearest window in the direction pressed', () => {
            start();
            const [left, middle, right] = world.workspace.add(
                new FakeWindow({ rect: { x: 0, y: 0, width: 200, height: 200 } }),
                new FakeWindow({ rect: { x: 800, y: 0, width: 200, height: 200 } }),
                new FakeWindow({ rect: { x: 1600, y: 0, width: 200, height: 200 } }),
            );
            world.focus(middle);

            Main.press('focus-right');
            expect(Main.activated).toEqual([right]);

            world.focus(middle);
            Main.press('focus-left');
            expect(Main.activated).toEqual([right, left]);
        });

        it('skips minimized windows', () => {
            start();
            const [origin, hidden, far] = world.workspace.add(
                new FakeWindow({ rect: { x: 0, y: 0, width: 200, height: 200 } }),
                new FakeWindow({
                    rect: { x: 400, y: 0, width: 200, height: 200 },
                    minimized: true,
                }),
                new FakeWindow({ rect: { x: 900, y: 0, width: 200, height: 200 } }),
            );
            world.focus(origin);

            Main.press('focus-right');
            expect(Main.activated).toEqual([far]);
            expect(Main.activated).not.toContain(hidden);
        });

        it('moves focus onto a maximized window, which cannot be placed', () => {
            start();
            const [origin, big] = world.workspace.add(
                new FakeWindow({ rect: { x: 0, y: 0, width: 200, height: 200 } }),
                new FakeWindow({
                    rect: { x: 900, y: 0, width: 200, height: 200 },
                    maximized: true,
                }),
            );
            world.focus(origin);

            Main.press('focus-right');
            expect(Main.activated).toEqual([big]);
        });

        it('crosses to a window on the next monitor', () => {
            start([WIDE, SECOND]);
            const [origin, other] = world.workspace.add(
                new FakeWindow({ rect: { x: 100, y: 0, width: 200, height: 200 } }),
                new FakeWindow({
                    rect: { x: 2000, y: 0, width: 200, height: 200 },
                    monitor: 1,
                }),
            );
            world.focus(origin);

            Main.press('focus-right');
            expect(Main.activated).toEqual([other]);
        });

        it('does nothing when there is no window in that direction', () => {
            start();
            const only = world.workspace.add(new FakeWindow())[0];
            world.focus(only);

            Main.press('focus-left');
            expect(Main.activated).toEqual([]);
        });
    });

    describe('swapping', () => {
        it('exchanges the geometry of two windows', () => {
            start();
            const a = { x: 0, y: 0, width: 300, height: 400 };
            const b = { x: 900, y: 100, width: 500, height: 200 };
            const [left, right] = world.workspace.add(
                new FakeWindow({ rect: a }),
                new FakeWindow({ rect: b }),
            );
            world.focus(left);

            Main.press('swap-right');

            expect(left.get_frame_rect()).toEqual(b);
            expect(right.get_frame_rect()).toEqual(a);
        });

        // A maximized window's frame rect is the work area, and on Wayland it
        // stays the work area after unmaximize() until the client commits. So
        // there is no moment at which its restored geometry can be read back,
        // and copying whatever the rect says hands the neighbor a
        // work-area-sized frame with no maximized flag: it looks maximized,
        // Mutter's restore no longer applies, and matchZone finds no zone.
        // The neighbor is maximized instead, and the maximized window takes
        // the neighbor's geometry, read before anything moved.
        it.each([
            ['synchronously, as on X11', false],
            ['when the client commits later, as on Wayland', true],
        ])('swaps with a maximized window %s', (_how, deferred) => {
            start();
            const restore = { x: 100, y: 100, width: 400, height: 300 };
            const other = { x: 1200, y: 0, width: 500, height: 200 };
            const [big, small] = world.workspace.add(
                new FakeWindow({ rect: restore, maximized: true, deferred }),
                new FakeWindow({ rect: other, deferred }),
            );
            world.focus(big);

            Main.press('swap-right');
            big.commit();
            small.commit();

            expect(big.is_maximized()).toBe(false);
            expect(big.get_frame_rect()).toEqual(other);
            expect(small.is_maximized()).toBe(true);
            expect(small.moves).toHaveLength(0);
        });

        it('keeps the maximized one maximized when the neighbor is too', () => {
            start([WIDE, SECOND]);
            const [left, right] = world.workspace.add(
                new FakeWindow({
                    rect: { x: 100, y: 100, width: 400, height: 300 },
                    maximized: true,
                    deferred: true,
                }),
                new FakeWindow({
                    rect: { x: 2000, y: 100, width: 400, height: 300 },
                    monitor: 1,
                    maximized: true,
                    deferred: true,
                }),
            );
            world.focus(left);

            Main.press('swap-right');
            left.commit();
            right.commit();

            expect(left.is_maximized()).toBe(true);
            expect(right.is_maximized()).toBe(true);
            expect(left.get_monitor()).toBe(1);
            expect(right.get_monitor()).toBe(0);
            expect(left.get_frame_rect()).toEqual(SECOND);
            expect(right.get_frame_rect()).toEqual(WIDE);
        });

        it('maximizes onto the neighbor monitor when that is where it was', () => {
            start([WIDE, SECOND]);
            const tiled = { x: 8, y: 8, width: 472, height: 1064 };
            const [left, right] = world.workspace.add(
                new FakeWindow({ rect: tiled, deferred: true }),
                new FakeWindow({
                    rect: { x: 2000, y: 100, width: 400, height: 300 },
                    monitor: 1,
                    maximized: true,
                    deferred: true,
                }),
            );
            world.focus(left);

            Main.press('swap-right');
            left.commit();
            right.commit();

            expect(left.get_monitor()).toBe(1);
            expect(left.is_maximized()).toBe(true);
            expect(right.is_maximized()).toBe(false);
            expect(right.get_frame_rect()).toEqual(tiled);
        });

        it('exchanges geometry read before either window moved', () => {
            start();
            const a = { x: 0, y: 0, width: 300, height: 400 };
            const b = { x: 900, y: 100, width: 500, height: 200 };
            const [left, right] = world.workspace.add(
                new FakeWindow({ rect: a, deferred: true }),
                new FakeWindow({ rect: b, deferred: true }),
            );
            world.focus(left);

            Main.press('swap-right');
            left.commit();
            right.commit();

            expect(left.get_frame_rect()).toEqual(b);
            expect(right.get_frame_rect()).toEqual(a);
        });

        it('exchanges leftwards as well as rightwards', () => {
            start();
            const a = { x: 0, y: 0, width: 300, height: 400 };
            const b = { x: 900, y: 100, width: 500, height: 200 };
            const [left, right] = world.workspace.add(
                new FakeWindow({ rect: a }),
                new FakeWindow({ rect: b }),
            );
            world.focus(right);

            Main.press('swap-left');

            expect(right.get_frame_rect()).toEqual(a);
            expect(left.get_frame_rect()).toEqual(b);
        });

        it('does nothing when there is no neighbor', () => {
            start();
            const only = world.workspace.add(new FakeWindow())[0];
            world.focus(only);

            Main.press('swap-right');
            expect(only.moves).toHaveLength(0);
        });
    });

    describe('moving between monitors', () => {
        it('does nothing with only one monitor', () => {
            start();
            const window = world.workspace.add(new FakeWindow())[0];
            world.focus(window);

            Main.press('move-monitor-next');
            expect(window.get_monitor()).toBe(0);
            expect(window.moves).toHaveLength(0);
        });

        it('moves to the next monitor and wraps back around', () => {
            start([WIDE, SECOND]);
            const window = world.workspace.add(new FakeWindow())[0];
            world.focus(window);

            Main.press('move-monitor-next');
            expect(window.get_monitor()).toBe(1);
            Main.press('move-monitor-next');
            expect(window.get_monitor()).toBe(0);
        });

        // Going left from monitor 0 needs the addend: a bare % would return -1.
        it('moves to the previous monitor and wraps without a negative index', () => {
            start([WIDE, SECOND]);
            const window = world.workspace.add(new FakeWindow())[0];
            world.focus(window);

            Main.press('move-monitor-prev');
            expect(window.get_monitor()).toBe(1);
            Main.press('move-monitor-prev');
            expect(window.get_monitor()).toBe(0);
        });

        it('keeps the zone, re-projected onto the destination work area', () => {
            start([WIDE, SECOND]);
            const window = world.workspace.add(new FakeWindow())[0];
            world.focus(window);

            Main.press('tile-left');
            expect(window.get_frame_rect()).toEqual(zone('left-quarter', WIDE));

            Main.press('move-monitor-next');
            expect(window.get_monitor()).toBe(1);
            expect(window.get_frame_rect()).toEqual(zone('left-quarter', SECOND));
        });

        it('moves an untiled window without placing it into a zone', () => {
            start([WIDE, SECOND]);
            const rect = { x: 300, y: 200, width: 640, height: 480 };
            const window = world.workspace.add(new FakeWindow({ rect }))[0];
            world.focus(window);

            Main.press('move-monitor-next');

            expect(window.get_monitor()).toBe(1);
            expect(window.moves).toHaveLength(0);
        });
    });
});
