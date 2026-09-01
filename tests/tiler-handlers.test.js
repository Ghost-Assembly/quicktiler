import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSettings } from './support/world.js';

// The one place a module mock is warranted. modules/tiler.js warns when an
// action in the shared list has no handler, and tests/actions.test.js exists to
// keep that list and the gschema in step — so the branch cannot be reached with
// real data. Faking an inconsistent ACTIONS is the only way to prove the guard
// works, and proving it matters: without it such an action is silently inert.
//
// Everything is imported dynamically after vi.resetModules(), because the reset
// builds a fresh module graph: a statically imported stub would be a different
// instance from the one modules/tiler.js ends up talking to.
describe('Tiler with an action that has no handler', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.doUnmock('../modules/actions.js');
        vi.resetModules();
    });

    it('warns and skips it, binding every action that does have one', async () => {
        vi.doMock('../modules/actions.js', async importOriginal => {
            const actual = await importOriginal();
            return {
                ...actual,
                ACTIONS: Object.freeze([
                    ...actual.ACTIONS,
                    Object.freeze({ key: 'tile-diagonally', label: 'Tile diagonally' }),
                ]),
            };
        });

        const Main = await import('./stubs/shell-main.js');
        const { Tiler } = await import('../modules/tiler.js');
        const { ACTION_KEYS } = await import('../modules/actions.js');

        Main.reset();
        globalThis.global = { display: { get_focus_window: () => null } };

        const tiler = new Tiler(createSettings());
        tiler.enable();

        expect(console.warn).toHaveBeenCalledWith(
            '[tiler] no handler for action tile-diagonally',
        );
        expect(Main.registered.has('tile-diagonally')).toBe(false);
        expect([...Main.registered.keys()].sort()).toEqual(
            ACTION_KEYS.filter(key => key !== 'tile-diagonally').sort(),
        );

        tiler.disable();
        expect(Main.registered.size).toBe(0);
    });
});
