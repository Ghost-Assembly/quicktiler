import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import QuickTilerExtension from '../extension.js';
import { ACTION_KEYS } from '../modules/actions.js';
import { KEYS } from '../modules/settings.js';
import * as Main from './stubs/shell-main.js';
import { resetActors } from './support/actors.js';
import { FakeWindow, createSettings, createWorld } from './support/world.js';

describe('QuickTilerExtension', () => {
    let extension;

    let world;

    beforeEach(() => {
        Main.reset();
        resetActors();
        world = createWorld();
        vi.spyOn(console, 'debug').mockImplementation(() => {});

        extension = new QuickTilerExtension({ 'version-name': '1.2.3' });
        extension.settings = createSettings();
    });

    /** The quick settings tile the extension installed. */
    const toggle = () => Main.externalIndicators.at(-1).indicator.quickSettingsItems[0];

    /**
     * The tile's menu, opened. It builds itself on first open, as in the Shell.
     *
     * @returns {object} The open menu.
     */
    const menu = () => {
        const tile = toggle();
        tile.menu.open();
        return tile.menu;
    };

    /** The row for one action, walking the tile's sections in order. */
    const rowFor = key => {
        const rows = menu()
            .items.filter(item => item.menu)
            .flatMap(section => section.menu.items);
        return rows.at(ACTION_KEYS.indexOf(key));
    };

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('registers every action on enable', () => {
        extension.enable();

        expect([...Main.registered.keys()].sort()).toEqual([...ACTION_KEYS].sort());
    });

    it('releases every keybinding on disable', () => {
        extension.enable();
        extension.disable();

        expect(Main.registered.size).toBe(0);
        expect(Main.removeCalls.sort()).toEqual([...ACTION_KEYS].sort());
    });

    // scripts/headless-check.sh asserts this against a real Shell by looking for
    // a second marker in the log; this is the same property, unit-tested.
    it('can be enabled again after being disabled, without stacking bindings', () => {
        extension.enable();
        extension.disable();
        extension.enable();

        expect([...Main.registered.keys()].sort()).toEqual([...ACTION_KEYS].sort());
        expect(Main.addCalls).toHaveLength(ACTION_KEYS.length * 2);
    });

    it('logs the marker headless-check.sh greps for, with the version', () => {
        extension.enable();

        expect(console.debug).toHaveBeenCalledWith('[quicktiler] enabled (v1.2.3)');
    });

    it('falls back to ? when metadata carries no version name', () => {
        const bare = new QuickTilerExtension({});
        bare.settings = createSettings();
        bare.enable();

        expect(console.debug).toHaveBeenCalledWith('[quicktiler] enabled (v?)');
    });

    it('drops its QuickTiler and its Panel on disable', () => {
        extension.enable();
        extension.disable();

        expect(extension._quicktiler).toBeNull();
        expect(extension._panel).toBeNull();
    });

    it('builds the tile with an icon from its own directory', () => {
        extension.enable();

        expect(toggle().gicon.name).toBe(
            '/nonexistent/extension/icons/quicktiler-symbolic.svg',
        );
    });

    // The whole point of the tile, and the one thing neither modules/panel.js
    // nor modules/quicktiler.js can prove on its own: the switch is wired to
    // the keybindings.
    it('releases every keybinding when the tile is clicked', () => {
        extension.enable();
        toggle().click();

        expect(Main.registered.size).toBe(0);
        expect(Main.removeCalls.sort()).toEqual([...ACTION_KEYS].sort());
    });

    it('registers them again when the tile is clicked back on', () => {
        extension.enable();
        toggle().click();
        toggle().click();

        expect([...Main.registered.keys()].sort()).toEqual([...ACTION_KEYS].sort());
        expect(Main.addCalls).toHaveLength(ACTION_KEYS.length * 2);
    });

    it('shows the pause on the tile when the preferences window sets it', () => {
        extension.enable();
        extension.settings.emitChange(KEYS.SHORTCUTS_ENABLED, false);

        expect(toggle().checked).toBe(false);
        expect(Main.registered.size).toBe(0);
    });

    it('tiles the focused window from a menu row', () => {
        extension.enable();
        const window = world.workspace.add(new FakeWindow())[0];
        world.focus(window);

        rowFor('tile-left').activate();

        expect(window.moves).toHaveLength(1);
    });

    it('opens the preferences window from the settings row', () => {
        extension.enable();
        menu().items.at(-1).activate();

        expect(extension.preferencesOpened).toBe(1);
    });

    it('tolerates disable without a preceding enable', () => {
        expect(() => extension.disable()).not.toThrow();
    });
});
