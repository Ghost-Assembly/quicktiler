import { describe, expect, it } from 'vitest';

import { isFocusable, isPlaceable } from '../modules/windows.js';

/** A window that every predicate should accept. */
const ordinary = {
    normal: true,
    overrideRedirect: false,
    skipTaskbar: false,
    fullscreen: false,
    maximized: false,
    allowsMove: true,
    allowsResize: true,
};

const facts = overrides => ({ ...ordinary, ...overrides });

describe('isPlaceable', () => {
    it('accepts an ordinary window', () => {
        expect(isPlaceable(ordinary)).toBe(true);
    });

    // Mutter's meta_window_allows_resize() returns FALSE while a window is
    // maximized, so asking it directly makes every maximized window untileable:
    // the maximize toggle never restores, and tiling a maximized window does
    // nothing at all. We unmaximize before placing, so the question to ask is
    // whether the window may be resized once it is no longer maximized.
    it('accepts a maximized window even though Mutter reports it unresizable', () => {
        expect(isPlaceable(facts({ maximized: true, allowsResize: false }))).toBe(true);
    });

    it('rejects a window that cannot be resized and is not maximized', () => {
        expect(isPlaceable(facts({ allowsResize: false }))).toBe(false);
    });

    it.each([
        ['is not a normal window', { normal: false }],
        ['is override-redirect', { overrideRedirect: true }],
        ['is hidden from the taskbar', { skipTaskbar: true }],
        ['is fullscreen', { fullscreen: true }],
        ['cannot be moved', { allowsMove: false }],
    ])('rejects a window that %s', (_reason, overrides) => {
        expect(isPlaceable(facts(overrides))).toBe(false);
    });

    it('rejects a missing window', () => {
        expect(isPlaceable(null)).toBe(false);
    });
});

describe('isFocusable', () => {
    it('accepts an ordinary window', () => {
        expect(isFocusable(ordinary)).toBe(true);
    });

    // Moving focus resizes nothing, so it must not inherit the placement rules.
    // Gating focus on allows_resize() would make it impossible to move focus off
    // a maximized window, or onto one, or off a fixed-size dialog-like window.
    it.each([
        ['maximized', { maximized: true, allowsResize: false }],
        ['fixed-size', { allowsResize: false }],
        ['immovable', { allowsMove: false }],
        ['fullscreen', { fullscreen: true }],
    ])('accepts a %s window, which cannot be placed', (_reason, overrides) => {
        expect(isFocusable(facts(overrides))).toBe(true);
    });

    it.each([
        ['is not a normal window', { normal: false }],
        ['is override-redirect', { overrideRedirect: true }],
        ['is hidden from the taskbar', { skipTaskbar: true }],
    ])('rejects a window that %s', (_reason, overrides) => {
        expect(isFocusable(facts(overrides))).toBe(false);
    });

    it('rejects a missing window', () => {
        expect(isFocusable(null)).toBe(false);
    });
});
