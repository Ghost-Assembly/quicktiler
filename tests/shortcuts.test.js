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
        const lookup = bindings({ 'tile-right': ['<Super>k'] });

        expect(conflictingActions('tile-left', '<Super>j', lookup)).toEqual([]);
    });

    it('names the action already holding the accelerator', () => {
        const lookup = bindings({ 'swap-right': ['<Super>j'] });

        expect(conflictingActions('tile-left', '<Super>j', lookup)).toEqual([
            'swap-right',
        ]);
    });

    it('does not report the action against itself', () => {
        const lookup = bindings({ 'tile-left': ['<Super>j'] });

        expect(conflictingActions('tile-left', '<Super>j', lookup)).toEqual([]);
    });

    it('reports every holder when more than one already has it', () => {
        const lookup = bindings({
            'swap-left': ['<Super>j'],
            'focus-right': ['<Super>j'],
        });

        expect(conflictingActions('tile-left', '<Super>j', lookup).sort()).toEqual([
            'focus-right',
            'swap-left',
        ]);
    });

    it('treats clearing a binding as conflicting with nothing', () => {
        const lookup = bindings({ 'swap-right': [''] });

        expect(conflictingActions('tile-left', '', lookup)).toEqual([]);
    });

    it('ignores an action whose accelerator merely resembles the new one', () => {
        const lookup = bindings({ 'swap-right': ['<Super><Shift>j'] });

        expect(conflictingActions('tile-left', '<Super>j', lookup)).toEqual([]);
    });
});

describe('isValidBinding', () => {
    const SHIFT = 1;
    const gtk = { shiftMask: SHIFT, acceleratorValid: () => true };

    it('rejects a bare key, which would be stolen from every application', () => {
        expect(isValidBinding(0, 0x6a, gtk)).toBe(false);
    });

    it('rejects Shift alone, which just types a capital letter', () => {
        expect(isValidBinding(SHIFT, 0x6a, gtk)).toBe(false);
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
