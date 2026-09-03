import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ACTION_KEYS } from '../modules/actions.js';
import { KEYS, SETTINGS, SETTING_KEYS } from '../modules/settings.js';

const SCHEMA = fileURLToPath(
    new URL(
        '../schemas/org.gnome.shell.extensions.quicktiler.gschema.xml',
        import.meta.url,
    ),
);

/**
 * Every non-keybinding key the gschema declares, with its type.
 *
 * The `as` keys are the actions and are checked by tests/actions.test.js;
 * everything else is a setting and belongs to modules/settings.js. Read from
 * the file rather than from a second hand-written list, for the reason
 * tests/actions.test.js gives.
 *
 * @returns {Map<string, string>} Key name to gvariant type, in declaration order.
 */
function schemaSettings() {
    // SCHEMA is a module-relative constant resolved from import.meta.url, not
    // input of any kind; the rule cannot see that it is not a variable path.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const xml = readFileSync(SCHEMA, 'utf8');

    return new Map(
        [...xml.matchAll(/<key\s+type="([^"]+)"\s+name="([^"]+)"/g)]
            .filter(match => match[1] !== 'as')
            .map(match => [match[2], match[1]]),
    );
}

describe('SETTINGS', () => {
    it('finds a non-empty set of settings in the schema', () => {
        // Guards the regex: if the schema's formatting changed, the comparisons
        // below would pass by comparing two empty lists.
        expect(schemaSettings().size).toBeGreaterThan(0);
    });

    it('matches the gschema setting keys exactly', () => {
        expect([...SETTING_KEYS].sort()).toEqual([...schemaSettings().keys()].sort());
    });

    it('declares the same type the schema does', () => {
        const declared = schemaSettings();
        for (const { key, type } of SETTINGS) expect(declared.get(key)).toBe(type);
    });

    it('lists settings in the schema declaration order', () => {
        expect([...SETTING_KEYS]).toEqual([...schemaSettings().keys()]);
    });

    // A key that is both an action and a setting would be bound as a shortcut
    // and bound to a switch, and whichever wrote last would win silently.
    it('shares no key with the action list', () => {
        const actions = new Set(ACTION_KEYS);
        for (const key of SETTING_KEYS) expect(actions).not.toContain(key);
    });

    it('names every key it exports', () => {
        expect([...Object.values(KEYS)].sort()).toEqual([...SETTING_KEYS].sort());
    });

    it('is frozen, so no caller can reorder or extend it', () => {
        expect(Object.isFrozen(SETTINGS)).toBe(true);
        expect(SETTINGS.every(setting => Object.isFrozen(setting))).toBe(true);
        expect(Object.isFrozen(KEYS)).toBe(true);
    });
});
