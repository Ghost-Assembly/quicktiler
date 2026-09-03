import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { acceleratorLabel } from '../modules/accelerator.js';
import { ACTIONS, ACTIONS_BY_GROUP, ACTION_KEYS, GROUPS } from '../modules/actions.js';

const SCHEMA = fileURLToPath(
    new URL(
        '../schemas/org.gnome.shell.extensions.quicktiler.gschema.xml',
        import.meta.url,
    ),
);
const README = fileURLToPath(new URL('../README.md', import.meta.url));
const DOCS = fileURLToPath(new URL('../docs/index.html', import.meta.url));

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

describe('GROUPS', () => {
    // The menu builds its sections from GROUPS and fills them from
    // ACTIONS_BY_GROUP. An action whose group matches no section would simply
    // not be listed, with nothing anywhere to say so.
    it('gives every action a group that exists', () => {
        const ids = new Set(GROUPS.map(group => group.id));
        for (const action of ACTIONS) expect(ids).toContain(action.group);
    });

    it('leaves no group empty', () => {
        for (const group of GROUPS)
            expect(ACTIONS_BY_GROUP.get(group.id).length).toBeGreaterThan(0);
    });

    it('lists every action exactly once across the groups', () => {
        const grouped = GROUPS.flatMap(group => [...ACTIONS_BY_GROUP.get(group.id)]);
        expect(grouped).toEqual([...ACTIONS]);
    });

    it('gives every group a non-empty label', () => {
        for (const group of GROUPS) expect(group.label.trim()).not.toBe('');
    });

    it('gives every group a unique id', () => {
        expect(new Set(GROUPS.map(group => group.id)).size).toBe(GROUPS.length);
    });

    it('is frozen, so no caller can reorder or extend it', () => {
        expect(Object.isFrozen(GROUPS)).toBe(true);
        expect(GROUPS.every(group => Object.isFrozen(group))).toBe(true);
    });
});

/**
 * Read a file the tests own, by absolute path.
 *
 * @param {string} path Absolute path.
 * @returns {string} File contents.
 */
function read(path) {
    // Each path is a module-relative constant resolved from import.meta.url, not
    // input of any kind; the rule cannot see that it is not a variable path.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return readFileSync(path, 'utf8');
}

/**
 * The accelerator each action defaults to, from the gschema.
 *
 * @returns {Map<string, string>} Schema key to accelerator, e.g. '<Super>bracketleft'.
 */
function schemaDefaults() {
    const xml = read(SCHEMA);
    const pattern =
        /<key\s+type="as"\s+name="([^"]+)">\s*<default><!\[CDATA\[\['([^']+)'\]\]\]><\/default>/g;

    return new Map([...xml.matchAll(pattern)].map(m => [m[1], m[2]]));
}

/**
 * Turn a gschema accelerator into the pieces documentation spells out.
 *
 * '<Super><Control><Shift>m' becomes ['ctrl', 'm', 'shift', 'super'], so the
 * comparison does not care whether prose writes Ctrl or Control, or which order
 * the modifiers appear in.
 *
 * The spelling comes from modules/accelerator.js rather than from a table kept
 * here. That module renders the same shortcut into the quick settings menu, so
 * sharing it is what stops the menu and the documentation from disagreeing
 * about whether a key is called Left or \u2190 — the same argument
 * modules/actions.js makes for the action list.
 *
 * @param {string} accelerator Accelerator in gschema form.
 * @returns {string[]} Lower-case parts, sorted.
 */
function parts(accelerator) {
    return acceleratorLabel(accelerator).toLowerCase().split('+').sort();
}

/** Parts that are modifiers rather than a key in their own right. */
const MODIFIERS = new Set(['super', 'ctrl', 'control', 'shift', 'alt']);

/**
 * Every shortcut documented in a file, as sorted parts.
 *
 * Scans the <kbd> elements in order and groups any that are joined by a literal
 * "+", which works for both the README's markdown tables and the docs site's
 * HTML ones. Groups are collected by walking the matches rather than with one
 * regex spanning the whole run, which would need a nested quantifier.
 *
 * The tag pattern tolerates whitespace inside the angle brackets, because
 * Prettier wraps long lines there — `<kbd\n    >M</kbd\n>` is the same element
 * and must not be missed.
 *
 * Groups that are entirely modifiers are dropped: prose like "Super+Ctrl moves
 * windows" describes a convention, not a shortcut.
 *
 * @param {string} text File contents.
 * @returns {string[][]} One entry per documented shortcut, each sorted.
 */
function documented(text) {
    const groups = [];
    let current = null;
    let previousEnd = -1;

    for (const match of text.matchAll(/<kbd\s*>([^<]*)<\/kbd\s*>/g)) {
        const joined =
            current !== null && /^\s*\+\s*$/.test(text.slice(previousEnd, match.index));

        if (joined) current.push(match[1]);
        else groups.push((current = [match[1]]));

        previousEnd = match.index + match[0].length;
    }

    return groups
        .map(group => group.map(part => part.trim().toLowerCase()))
        .filter(group => group.some(part => !MODIFIERS.has(part)))
        .map(group => group.map(part => (part === 'control' ? 'ctrl' : part)).sort());
}

describe('documented shortcuts', () => {
    const defaults = [...schemaDefaults().values()].map(parts);

    /**
     * @param {string[]} shortcut Sorted parts.
     * @returns {boolean} Whether the schema defaults contain it.
     */
    const isDefault = shortcut =>
        defaults.some(other => other.join('+') === shortcut.join('+'));

    it('finds a keybinding default for every action in the schema', () => {
        // Guards the parser: without this, an unmatched regex would let the
        // comparisons below pass by comparing two empty lists.
        expect(schemaDefaults().size).toBe(ACTION_KEYS.length);
    });

    it.each([
        ['README.md', README],
        ['docs/index.html', DOCS],
    ])('finds shortcuts documented in %s', (_name, path) => {
        expect(documented(read(path)).length).toBeGreaterThanOrEqual(
            ACTION_KEYS.length,
        );
    });

    // The tables exist in two places because a GitHub visitor wants them without
    // leaving the repo. That duplication is only safe while something checks it.
    it.each([
        ['README.md', README],
        ['docs/index.html', DOCS],
    ])('documents only shortcuts the schema actually sets, in %s', (_name, path) => {
        const wrong = documented(read(path))
            .filter(shortcut => !isDefault(shortcut))
            .map(shortcut => shortcut.join('+'));

        expect(wrong).toEqual([]);
    });
});
