import { describe, expect, it } from 'vitest';

import {
    CAPTURE_ASSIGN,
    CAPTURE_CANCEL,
    CAPTURE_CLEAR,
    CAPTURE_IGNORE,
    captureOutcome,
    conflictingActions,
    isValidBinding,
} from '../modules/shortcuts.js';

describe('conflictingActions', () => {
    /**
     * A lookup over a map of schema key to accelerators.
     *
     * A Map rather than an object literal for the reason modules/zones.js gives:
     * indexing an object resolves inherited keys.
     *
     * @param {Record<string, string[]>} assigned Accelerators per schema key.
     * @returns {(key: string) => string[]} Lookup function.
     */
    const bindings = assigned => {
        const map = new Map(Object.entries(assigned));
        return key => map.get(key) ?? [];
    };

    it('finds no conflict when nothing else holds the accelerator', () => {
        const lookup = bindings({ 'quicktiler-tile-right': ['<Super>k'] });

        expect(conflictingActions('quicktiler-tile-left', '<Super>j', lookup)).toEqual(
            [],
        );
    });

    it('names the action already holding the accelerator', () => {
        const lookup = bindings({ 'quicktiler-swap-right': ['<Super>j'] });

        expect(conflictingActions('quicktiler-tile-left', '<Super>j', lookup)).toEqual([
            'quicktiler-swap-right',
        ]);
    });

    it('does not report the action against itself', () => {
        const lookup = bindings({ 'quicktiler-tile-left': ['<Super>j'] });

        expect(conflictingActions('quicktiler-tile-left', '<Super>j', lookup)).toEqual(
            [],
        );
    });

    it('reports every holder when more than one already has it', () => {
        const lookup = bindings({
            'quicktiler-swap-left': ['<Super>j'],
            'quicktiler-focus-right': ['<Super>j'],
        });

        expect(
            conflictingActions('quicktiler-tile-left', '<Super>j', lookup).sort(),
        ).toEqual(['quicktiler-focus-right', 'quicktiler-swap-left']);
    });

    it('treats clearing a binding as conflicting with nothing', () => {
        const lookup = bindings({ 'quicktiler-swap-right': [''] });

        expect(conflictingActions('quicktiler-tile-left', '', lookup)).toEqual([]);
    });

    // The gschema writes modifiers Super first; prefs.js writes a rebound
    // shortcut with Gtk.accelerator_name_with_keycode, which emits GTK's own
    // order. The two spellings are one key combination to Mutter, and a raw
    // string comparison let both actions hold it.
    it('finds a conflict spelled with the modifiers in another order', () => {
        const lookup = bindings({ 'quicktiler-tile-left': ['<Super><Control>Left'] });

        expect(
            conflictingActions('quicktiler-swap-left', '<Control><Super>Left', lookup),
        ).toEqual(['quicktiler-tile-left']);
    });

    it('finds a conflict spelled with a modifier alias', () => {
        const lookup = bindings({ 'quicktiler-tile-left': ['<Super><Primary>Left'] });

        expect(
            conflictingActions('quicktiler-swap-left', '<Control><Mod4>left', lookup),
        ).toEqual(['quicktiler-tile-left']);
    });

    it('checks every accelerator an action holds, not just the first', () => {
        const lookup = bindings({ 'quicktiler-tile-left': ['<Super>F5', '<Super>j'] });

        expect(conflictingActions('quicktiler-swap-left', '<Super>j', lookup)).toEqual([
            'quicktiler-tile-left',
        ]);
    });

    it('ignores an action whose accelerator merely resembles the new one', () => {
        const lookup = bindings({ 'quicktiler-swap-right': ['<Super><Shift>j'] });

        expect(conflictingActions('quicktiler-tile-left', '<Super>j', lookup)).toEqual(
            [],
        );
    });
});

describe('isValidBinding', () => {
    const SHIFT = 1;
    // 0x6a is 'j', which types something on its own.
    const gtk = { shiftMask: SHIFT, acceleratorValid: () => true, codePoint: 0x6a };

    it('rejects a bare key, which would be stolen from every application', () => {
        expect(isValidBinding(0, 0x6a, gtk)).toBe(false);
    });

    it('rejects Shift alone, which just types a capital letter', () => {
        expect(isValidBinding(SHIFT, 0x6a, gtk)).toBe(false);
    });

    // GNOME Settings' own rule: Shift alone is fine when the key types
    // nothing on its own, the way a function key does.
    it('accepts Shift+F5, since F5 types nothing on its own', () => {
        const F5 = 0xffc2;
        expect(isValidBinding(SHIFT, F5, { ...gtk, codePoint: 0 })).toBe(true);
    });

    // Shift with these selects text, moves focus or ends a line in every
    // application, though none of them types a visible character. Keyvals and
    // code points as Gdk 4 gives them (Gdk.KEY_*, Gdk.keyval_to_unicode) under
    // gjs; ISO_Left_Tab is what GTK reports for Shift+Tab, and dead_acute is a
    // dead key, which types the accent over the next letter.
    it.each([
        ['Left', 0xff51, 0],
        ['Up', 0xff52, 0],
        ['Right', 0xff53, 0],
        ['Down', 0xff54, 0],
        ['Home', 0xff50, 0],
        ['End', 0xff57, 0],
        ['Page_Up', 0xff55, 0],
        ['Page_Down', 0xff56, 0],
        ['Tab', 0xff09, 0x09],
        ['ISO_Left_Tab', 0xfe20, 0],
        ['Return', 0xff0d, 0x0d],
        ['KP_Enter', 0xff8d, 0],
        ['Mode_switch', 0xff7e, 0],
        ['dead_acute', 0xfe51, 0],
    ])(
        'rejects Shift+%s, which applications need for editing text',
        (_name, keyval, codePoint) => {
            expect(isValidBinding(SHIFT, keyval, { ...gtk, codePoint })).toBe(false);
        },
    );

    // The ends of each run of dead keys.
    it.each([
        ['dead_grave', 0xfe50],
        ['dead_currency', 0xfe6f],
        ['dead_a', 0xfe80],
        ['dead_hamza', 0xfe8d],
        ['dead_lowline', 0xfe90],
        ['dead_longsolidusoverlay', 0xfe93],
    ])('rejects Shift+%s, a dead key', (_name, keyval) => {
        expect(isValidBinding(SHIFT, keyval, { ...gtk, codePoint: 0 })).toBe(false);
    });

    // The same keys stay bindable with a modifier other than Shift.
    it('accepts Ctrl+Left and Super+Tab', () => {
        const CTRL = 4;
        const SUPER = 0x4000000;
        expect(isValidBinding(CTRL, 0xff51, { ...gtk, codePoint: 0 })).toBe(true);
        expect(isValidBinding(SUPER, 0xff09, { ...gtk, codePoint: 0x09 })).toBe(true);
    });

    it('rejects Shift+A, which is how a capital A is typed', () => {
        const A = 0x41;
        expect(isValidBinding(SHIFT, A, { ...gtk, codePoint: A })).toBe(false);
    });

    it('accepts a real modifier combination', () => {
        expect(isValidBinding(4, 0x6a, gtk)).toBe(true);
    });

    it('defers to Gtk when the modifiers are acceptable', () => {
        const rejecting = { shiftMask: SHIFT, acceleratorValid: () => false };

        expect(isValidBinding(4, 0x6a, rejecting)).toBe(false);
    });

    it('passes the keyval and mask through to Gtk unchanged', () => {
        const seen = [];
        const recording = {
            shiftMask: SHIFT,
            acceleratorValid: (keyval, mask) => {
                seen.push([keyval, mask]);
                return true;
            },
        };

        isValidBinding(4, 0x6a, recording);
        expect(seen).toEqual([[0x6a, 4]]);
    });
});

describe('captureOutcome', () => {
    const ESCAPE = 0xff1b;
    const BACKSPACE = 0xff08;
    const SHIFT = 1;
    const CTRL = 4;

    const gtk = {
        escapeKey: ESCAPE,
        backspaceKey: BACKSPACE,
        shiftMask: SHIFT,
        acceleratorValid: () => true,
        // 0x6a is 'j', the key every test below that is not Escape or
        // Backspace presses.
        codePoint: 0x6a,
    };

    it('cancels on unmodified Escape', () => {
        expect(captureOutcome(ESCAPE, 0, gtk)).toBe(CAPTURE_CANCEL);
    });

    it('clears on unmodified Backspace', () => {
        expect(captureOutcome(BACKSPACE, 0, gtk)).toBe(CAPTURE_CLEAR);
    });

    // Otherwise Ctrl+Escape could never be bound: it would always cancel.
    it('treats a modified Escape as an ordinary combination', () => {
        expect(captureOutcome(ESCAPE, CTRL, gtk)).toBe(CAPTURE_ASSIGN);
    });

    it('treats a modified Backspace as an ordinary combination', () => {
        expect(captureOutcome(BACKSPACE, CTRL, gtk)).toBe(CAPTURE_ASSIGN);
    });

    it('ignores a bare key', () => {
        expect(captureOutcome(0x6a, 0, gtk)).toBe(CAPTURE_IGNORE);
    });

    it('ignores Shift alone', () => {
        expect(captureOutcome(0x6a, SHIFT, gtk)).toBe(CAPTURE_IGNORE);
    });

    it('assigns a valid modifier combination', () => {
        expect(captureOutcome(0x6a, CTRL, gtk)).toBe(CAPTURE_ASSIGN);
    });

    it('ignores a combination Gtk rejects', () => {
        const rejecting = { ...gtk, acceleratorValid: () => false };

        expect(captureOutcome(0x6a, CTRL, rejecting)).toBe(CAPTURE_IGNORE);
    });
});
