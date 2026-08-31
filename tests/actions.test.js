import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ACTIONS, ACTION_KEYS, conflictingActions } from '../modules/actions.js';

const SCHEMA = fileURLToPath(
    new URL('../schemas/org.gnome.shell.extensions.tiler.gschema.xml', import.meta.url),
);

/**
 * Every keybinding key the gschema declares.
 *
 * Keybindings are the `as` keys; `gap` and any future scalar setting are not
 * actions and must not appear. Read from the file rather than from a second
 * hand-written list, because a second list is the problem this test exists to
 * catch.
 *
 * @returns {string[]} Schema key names, in declaration order.
 */
function schemaKeys() {
    // SCHEMA is a module-relative constant resolved from import.meta.url, not
    // input of any kind; the rule cannot see that it is not a variable path.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const xml = readFileSync(SCHEMA, 'utf8');

    return [...xml.matchAll(/<key\s+type="as"\s+name="([^"]+)"/g)].map(m => m[1]);
}

describe('ACTIONS', () => {
    // The three-way drift this guards against is silent at runtime: a key in
    // the schema with no entry here is a shortcut the preferences window never
    // shows, and an entry here with no schema key makes getSettings() abort.
    it('matches the gschema keybinding keys exactly', () => {
        expect([...ACTION_KEYS].sort()).toEqual(schemaKeys().sort());
    });

    it('finds a non-empty set of keys in the schema', () => {
        // Guards the regex itself: if the schema's formatting changed, the
        // comparison above would pass by comparing two empty lists.
        expect(schemaKeys().length).toBeGreaterThan(0);
    });

    it('lists actions in the schema declaration order', () => {
        expect([...ACTION_KEYS]).toEqual(schemaKeys());
    });

    it('gives every action a unique key', () => {
        expect(new Set(ACTION_KEYS).size).toBe(ACTION_KEYS.length);
    });

    it('gives every action a non-empty label', () => {
        for (const action of ACTIONS) expect(action.label.trim()).not.toBe('');
    });

    it('is frozen, so no caller can reorder or extend it', () => {
        expect(Object.isFrozen(ACTIONS)).toBe(true);
        expect(ACTIONS.every(action => Object.isFrozen(action))).toBe(true);
    });
});

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
