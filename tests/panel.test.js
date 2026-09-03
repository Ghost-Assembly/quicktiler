import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bindingLabel } from '../modules/accelerator.js';
import { ACTIONS_BY_GROUP, ACTION_KEYS, GROUPS } from '../modules/actions.js';
import { Panel } from '../modules/panel.js';
import { KEYS } from '../modules/settings.js';
import * as Main from './stubs/shell-main.js';
import { liveHandlers, resetActors } from './support/actors.js';
import { FakeWindow, createSettings, createWorld } from './support/world.js';

const ICON = '/nonexistent/quicktiler/icons/quicktiler-symbolic.svg';

// A couple of real accelerators, so the rows show something. The full set is
// checked against the gschema by tests/accelerator.test.js.
const BOUND = {
    'tile-left': ['<Super><Control>Left'],
    'tile-right': ['<Super><Control>Right'],
    'move-monitor-prev': ['<Super><Control><Shift>m'],
};

describe('Panel', () => {
    let settings;
    let panel;
    let world;
    let actions;
    let preferencesOpened;

    /**
     * Build a Panel over a fresh world and enable it.
     *
     * @returns {Panel} The enabled panel.
     */
    const start = () => {
        world = createWorld();
        panel = new Panel({
            settings,
            iconPath: ICON,
            runAction: (key, target) => actions.push({ key, target }),
            openPreferences: () => (preferencesOpened += 1),
        });
        panel.enable();
        return panel;
    };

    /** The tile currently installed, or undefined if there is none. */
    const toggle = () =>
        Main.externalIndicators.at(-1)?.indicator.quickSettingsItems[0];

    /** The submenu section for a group id. */
    const section = id =>
        toggle().menu.items[GROUPS.findIndex(group => group.id === id)];

    /** Every action row, in menu order. */
    const rows = () => GROUPS.flatMap(group => section(group.id).menu.items);

    /** The row for one action key. */
    const rowFor = key => rows().at(ACTION_KEYS.indexOf(key));

    /**
     * The accelerator text shown on a row.
     *
     * Not simply the first child with a `text`: that is the row's own label,
     * which PopupMenuItem adds first. The accelerator is the one the panel
     * added beside it.
     */
    const acceleratorOn = row =>
        row.children.find(child => child !== row.label && 'text' in child).text;

    beforeEach(() => {
        Main.reset();
        resetActors();
        settings = createSettings({ ...BOUND });
        actions = [];
        preferencesOpened = 0;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('placement', () => {
        it('installs one tile through addExternalIndicator', () => {
            start();

            expect(Main.externalIndicators).toHaveLength(1);
            expect(
                Main.externalIndicators[0].indicator.quickSettingsItems,
            ).toHaveLength(1);
        });

        // A permanent top bar icon that never changes is noise, and this
        // extension has no status to report between keypresses.
        it('adds no top bar indicator icon', () => {
            start();

            expect(Main.externalIndicators[0].indicator.indicators).toHaveLength(0);
        });

        it('draws the tile with an icon built from the injected path', () => {
            start();

            expect(toggle().gicon).toEqual({ name: ICON, isGicon: true });
        });
    });

    describe('the show-quick-settings switch', () => {
        it('builds nothing when the tile is switched off', () => {
            settings = createSettings({ ...BOUND, [KEYS.SHOW_QUICK_SETTINGS]: false });
            start();

            expect(Main.externalIndicators).toHaveLength(0);
        });

        it('still watches the key, so it can be switched on again', () => {
            settings = createSettings({ ...BOUND, [KEYS.SHOW_QUICK_SETTINGS]: false });
            start();

            settings.emitChange(KEYS.SHOW_QUICK_SETTINGS, true);

            expect(Main.externalIndicators).toHaveLength(1);
        });

        it('destroys the tile when it is switched off at runtime', () => {
            start();
            const tile = toggle();
            const indicator = Main.externalIndicators[0].indicator;

            settings.emitChange(KEYS.SHOW_QUICK_SETTINGS, false);

            expect(tile._wasDestroyed).toBe(true);
            expect(indicator._wasDestroyed).toBe(true);
        });

        it('leaves no handler connected when it is switched off', () => {
            start();
            settings.emitChange(KEYS.SHOW_QUICK_SETTINGS, false);

            // The settings watches are Gio handler ids, not actor handlers, so
            // liveHandlers holds only what the tile connected.
            expect(liveHandlers.size).toBe(0);
        });

        it('builds only one tile however often the key is rewritten', () => {
            start();
            settings.emitChange(KEYS.SHOW_QUICK_SETTINGS, true);

            expect(Main.externalIndicators).toHaveLength(1);
        });
    });

    describe('the pause switch', () => {
        it('shows shortcuts as active when they are', () => {
            start();

            expect(toggle().checked).toBe(true);
            expect(toggle().subtitle).toBe('Shortcuts active');
            expect(toggle().menu.header.subtitle).toBe('Shortcuts active');
        });

        it('shows shortcuts as paused when they are', () => {
            settings = createSettings({ ...BOUND, [KEYS.SHORTCUTS_ENABLED]: false });
            start();

            expect(toggle().checked).toBe(false);
            expect(toggle().subtitle).toBe('Shortcuts paused');
            expect(toggle().menu.header.subtitle).toBe('Shortcuts paused');
        });

        it('names the tile in the menu header, with its icon', () => {
            start();

            expect(toggle().menu.header.title).toBe('QuickTiler');
            expect(toggle().menu.header.icon).toEqual({ name: ICON, isGicon: true });
        });

        it('writes the pause when the tile is clicked', () => {
            start();
            toggle().click();

            expect(settings.get_boolean(KEYS.SHORTCUTS_ENABLED)).toBe(false);
        });

        it('writes it back when the tile is clicked again', () => {
            start();
            toggle().click();
            toggle().click();

            expect(settings.get_boolean(KEYS.SHORTCUTS_ENABLED)).toBe(true);
        });

        // The preferences window binds the same key, so a change made there has
        // to reach the tile without a click.
        it('follows a change made outside the tile', () => {
            start();
            settings.emitChange(KEYS.SHORTCUTS_ENABLED, false);

            expect(toggle().checked).toBe(false);
            expect(toggle().subtitle).toBe('Shortcuts paused');
            expect(toggle().menu.header.subtitle).toBe('Shortcuts paused');
        });
    });

    describe('the menu', () => {
        it('lists one section per group, in order', () => {
            start();
            const titles = GROUPS.map(
                (_group, index) => toggle().menu.items.at(index).text,
            );

            expect(titles).toEqual(GROUPS.map(group => group.label));
        });

        it('fills each section with its own actions, in order', () => {
            start();

            for (const group of GROUPS) {
                const labels = section(group.id).menu.items.map(item => item.text);
                expect(labels).toEqual(
                    ACTIONS_BY_GROUP.get(group.id).map(action => action.label),
                );
            }
        });

        it('gives every action a row', () => {
            start();

            expect(rows()).toHaveLength(ACTION_KEYS.length);
        });

        it('shows each row the shortcut it currently holds', () => {
            start();

            for (const key of ACTION_KEYS)
                expect(acceleratorOn(rowFor(key))).toBe(
                    bindingLabel(settings.get_strv(key)),
                );

            // Guards the check above: with nothing bound it would pass by
            // comparing every row's empty string against another empty string.
            expect(acceleratorOn(rowFor('tile-left'))).toBe('Super+Ctrl+←');
            expect(acceleratorOn(rowFor('move-monitor-prev'))).toBe(
                'Super+Ctrl+Shift+M',
            );
        });

        it('shows nothing for an action that is unbound', () => {
            settings = createSettings({ ...BOUND, 'tile-left': [] });
            start();

            expect(acceleratorOn(rowFor('tile-left'))).toBe('');
        });

        it('separates the settings row from the sections', () => {
            start();
            const items = toggle().menu.items;

            expect(items).toHaveLength(GROUPS.length + 2);
            expect(items.at(-1).text).toBe('Settings');
        });

        it('opens the preferences window from the settings row', () => {
            start();
            toggle().menu.items.at(-1).activate();

            expect(preferencesOpened).toBe(1);
        });
    });

    describe('rebinding a shortcut', () => {
        it('retexts the row whose accelerator changed', () => {
            start();
            settings.emitChange('tile-left', ['<Super>F5']);

            expect(acceleratorOn(rowFor('tile-left'))).toBe('Super+F5');
        });

        it('leaves every other row alone', () => {
            start();
            const before = acceleratorOn(rowFor('tile-right'));

            settings.emitChange('tile-left', ['<Super>F5']);

            expect(acceleratorOn(rowFor('tile-right'))).toBe(before);
        });

        // Rebuilding would destroy a row a click could still be travelling
        // through. Retexting one label cannot.
        it('destroys no rows', () => {
            start();
            const row = rowFor('tile-left');

            settings.emitChange('tile-left', ['<Super>F5']);

            expect(row._wasDestroyed).toBe(false);
            expect(rowFor('tile-left')).toBe(row);
        });
    });

    describe('performing an action', () => {
        it('runs the action its row names', () => {
            start();
            rowFor('tile-right').activate();

            // Nothing was focused in this test, so the target is null and
            // modules/quicktiler.js falls back to reading the display.
            expect(actions).toEqual([{ key: 'tile-right', target: null }]);
        });

        it('closes the panel, because the result is a window that moved', () => {
            start();
            toggle().menu.open();
            rowFor('tile-left').activate();

            expect(toggle().menu.isOpen).toBe(false);
        });

        // The pause is about the keyboard. A click is an explicit request.
        it('runs while shortcuts are paused', () => {
            settings = createSettings({ ...BOUND, [KEYS.SHORTCUTS_ENABLED]: false });
            start();
            rowFor('tile-left').activate();

            expect(actions).toHaveLength(1);
        });
    });

    describe('the window an action acts on', () => {
        it('is the focused one', () => {
            start();
            const window = world.workspace.add(new FakeWindow())[0];
            world.focus(window);

            rowFor('tile-left').activate();

            expect(actions[0].target).toBe(window);
        });

        // Opening the menu takes a Clutter grab, and Mutter's focus window can
        // be null while it is held. Reading the display at click time would
        // then act on nothing, with no way to tell.
        it('is the last one focused, when the display answers nothing', () => {
            start();
            const [first, second] = world.workspace.add(
                new FakeWindow(),
                new FakeWindow(),
            );
            world.focus(first);
            world.focus(second);
            world.focus(null);

            rowFor('tile-left').activate();

            expect(actions[0].target).toBe(second);
        });

        it('is tracked only while the tile exists', () => {
            start();
            settings.emitChange(KEYS.SHOW_QUICK_SETTINGS, false);

            expect(liveHandlers.size).toBe(0);
        });
    });

    describe('defaults', () => {
        it('builds with no gettext, runAction or openPreferences', () => {
            world = createWorld();
            panel = new Panel({ settings, iconPath: ICON });
            panel.enable();

            expect(() => rowFor('tile-left').activate()).not.toThrow();
            expect(() => toggle().menu.items.at(-1).activate()).not.toThrow();
            expect(toggle().menu.items[0].text).toBe('Tile');
        });
    });

    describe('teardown', () => {
        it('leaves no actor handler connected', () => {
            start();
            toggle().menu.open();
            section('tile').menu.open();

            panel.disable();

            expect(liveHandlers.size).toBe(0);
        });

        it('leaves no settings handler connected', () => {
            start();
            panel.disable();

            expect(settings.connected.size).toBe(0);
        });

        it('destroys the tile and its indicator', () => {
            start();
            const tile = toggle();
            const indicator = Main.externalIndicators[0].indicator;

            panel.disable();

            expect(tile._wasDestroyed).toBe(true);
            expect(indicator._wasDestroyed).toBe(true);
        });

        it('survives enable, disable and enable again', () => {
            start();
            panel.disable();
            panel.enable();

            expect(Main.externalIndicators).toHaveLength(2);
            expect(rows()).toHaveLength(ACTION_KEYS.length);

            panel.disable();
            expect(liveHandlers.size).toBe(0);
        });

        it('tolerates being disabled without being enabled', () => {
            createWorld();
            panel = new Panel({ settings, iconPath: ICON });

            expect(() => panel.disable()).not.toThrow();
        });

        it('tolerates being disabled twice', () => {
            start();
            panel.disable();

            expect(() => panel.disable()).not.toThrow();
        });

        it('tolerates being disabled with the tile already hidden', () => {
            settings = createSettings({ ...BOUND, [KEYS.SHOW_QUICK_SETTINGS]: false });
            start();

            expect(() => panel.disable()).not.toThrow();
            expect(liveHandlers.size).toBe(0);
        });
    });
});
