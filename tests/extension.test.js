import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import QuickTilerExtension from '../extension.js';
import { ACTION_KEYS } from '../modules/actions.js';
import * as Main from './stubs/shell-main.js';
import { createSettings, createWorld } from './support/world.js';

describe('QuickTilerExtension', () => {
    let extension;

    beforeEach(() => {
        Main.reset();
        createWorld();
        vi.spyOn(console, 'debug').mockImplementation(() => {});

        extension = new QuickTilerExtension({ 'version-name': '1.2.3' });
        extension.settings = createSettings();
    });

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

    it('drops its QuickTiler on disable', () => {
        extension.enable();
        extension.disable();

        expect(extension._quicktiler).toBeNull();
    });

    it('tolerates disable without a preceding enable', () => {
        expect(() => extension.disable()).not.toThrow();
    });
});
