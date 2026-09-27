// One reader for the gschema, for the tests that check the shipped code against
// it.
//
// tests/actions.test.js, tests/accelerator.test.js and tests/settings.test.js
// all parse the same file. Written out in each of them, the schema's path and
// the regexes that pin its formatting had three and two copies respectively —
// so a change to how a default is written (a non-CDATA default, a second array
// entry, a reordered attribute) would break one suite's guard while leaving the
// others quietly checking less than they claim to. That is the same drift these
// suites exist to catch, so it is read in one place instead.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Absolute path to the shipped gschema. */
export const SCHEMA = fileURLToPath(
    new URL(
        '../../schemas/org.gnome.shell.extensions.quicktiler.gschema.xml',
        import.meta.url,
    ),
);

/**
 * Read a file the tests own, by absolute path.
 *
 * @param {string} path Absolute path.
 * @returns {string} File contents.
 */
export function read(path) {
    // Each path is a module-relative constant resolved from import.meta.url, not
    // input of any kind; the rule cannot see that it is not a variable path.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return readFileSync(path, 'utf8');
}

/**
 * The pre-0.3.0 keybinding key names, before the `quicktiler-` prefix.
 *
 * The gschema keeps them for one release, as deprecated, unused entries, so
 * that a 0.2.x copy of the extension still running when the new schema is
 * installed — gnome-shell keeps its old code loaded until the next logout or
 * lock/unlock — can still resolve the keybinding keys its `enable()` asks
 * for, instead of aborting the Shell. `modules/actions.js` must never read
 * them. Exported so the checks in tests/actions.test.js and
 * tests/accelerator.test.js that compare the schema's keybinding keys
 * against `ACTIONS` can exclude them by one shared list, rather than each
 * hand-rolling its own.
 *
 * @type {ReadonlyArray<string>}
 */
export const DEPRECATED_KEYS = Object.freeze([
    'tile-left',
    'tile-right',
    'tile-center',
    'tile-maximize',
    'focus-left',
    'focus-right',
    'swap-left',
    'swap-right',
    'move-monitor-next',
    'move-monitor-prev',
]);

/**
 * Every keybinding key the gschema declares.
 *
 * Keybindings are the `as` keys; `gap` and any future scalar setting are not
 * actions and must not appear. Read from the file rather than from a second
 * hand-written list, because a second list is the problem these tests exist to
 * catch.
 *
 * @returns {string[]} Schema key names, in declaration order.
 */
export function schemaKeys() {
    const xml = read(SCHEMA);

    return [...xml.matchAll(/<key\s+type="as"\s+name="([^"]+)"/g)].map(m => m[1]);
}

/**
 * Every non-keybinding key the gschema declares, with its type.
 *
 * The `as` keys are the actions and are checked by tests/actions.test.js;
 * everything else is a setting and belongs to modules/settings.js.
 *
 * @returns {Map<string, string>} Key name to gvariant type, in declaration order.
 */
export function schemaSettings() {
    const xml = read(SCHEMA);

    return new Map(
        [...xml.matchAll(/<key\s+type="([^"]+)"\s+name="([^"]+)"/g)]
            .filter(match => match[1] !== 'as')
            .map(match => [match[2], match[1]]),
    );
}

/**
 * The accelerator each action defaults to, from the gschema.
 *
 * @returns {Map<string, string>} Schema key to accelerator, e.g. '<Super>bracketleft'.
 */
export function schemaDefaults() {
    const xml = read(SCHEMA);
    const pattern =
        /<key\s+type="as"\s+name="([^"]+)">\s*<default><!\[CDATA\[\['([^']+)'\]\]\]><\/default>/g;

    return new Map([...xml.matchAll(pattern)].map(m => [m[1], m[2]]));
}
