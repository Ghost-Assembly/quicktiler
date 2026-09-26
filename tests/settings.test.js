import { describe, expect, it } from 'vitest';

import { ACTION_KEYS } from '../modules/actions.js';
import { KEYS, SETTINGS, ALL_KEYS } from '../modules/settings.js';
import { schemaSettings } from './support/schema.js';

describe('SETTINGS', () => {
    it('finds a non-empty set of settings in the schema', () => {
        // Guards the regex: if the schema's formatting changed, the comparisons
        // below would pass by comparing two empty lists.
        expect(schemaSettings().size).toBeGreaterThan(0);
    });

    it('matches the gschema setting keys exactly', () => {
        expect([...ALL_KEYS].sort()).toEqual([...schemaSettings().keys()].sort());
    });

    it('declares the same type the schema does', () => {
        const declared = schemaSettings();
        for (const { key, type } of SETTINGS) expect(declared.get(key)).toBe(type);
    });

    it('lists settings in the schema declaration order', () => {
        expect([...ALL_KEYS]).toEqual([...schemaSettings().keys()]);
    });

    // A key that is both an action and a setting would be bound as a shortcut
    // and bound to a switch, and whichever wrote last would win silently.
    it('shares no key with the action list', () => {
        const actions = new Set(ACTION_KEYS);
        for (const key of ALL_KEYS) expect(actions).not.toContain(key);
    });

    it('names every key it exports', () => {
        expect([...Object.values(KEYS)].sort()).toEqual([...ALL_KEYS].sort());
    });

    it('is frozen, so no caller can reorder or extend it', () => {
        expect(Object.isFrozen(SETTINGS)).toBe(true);
        expect(SETTINGS.every(setting => Object.isFrozen(setting))).toBe(true);
        expect(Object.isFrozen(KEYS)).toBe(true);
    });
});
