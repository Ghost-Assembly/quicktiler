import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    MODIFIER_ORDER,
    acceleratorLabel,
    bindingLabel,
    parseAccelerator,
} from '../modules/accelerator.js';
import { ACTION_KEYS } from '../modules/actions.js';

const SCHEMA = fileURLToPath(
    new URL(
        '../schemas/org.gnome.shell.extensions.quicktiler.gschema.xml',
        import.meta.url,
    ),
);

/**
 * The accelerator each action defaults to, read from the gschema rather than
 * copied here, so this test cannot drift away from what ships.
 *
 * @returns {Map<string, string>} Schema key to accelerator.
 */
function schemaDefaults() {
    // SCHEMA is a module-relative constant resolved from import.meta.url, not
    // input of any kind; the rule cannot see that it is not a variable path.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const xml = readFileSync(SCHEMA, 'utf8');
    const pattern =
        /<key\s+type="as"\s+name="([^"]+)">\s*<default><!\[CDATA\[\['([^']+)'\]\]\]><\/default>/g;

    return new Map([...xml.matchAll(pattern)].map(m => [m[1], m[2]]));
}

describe('acceleratorLabel', () => {
    const defaults = schemaDefaults();

    it('finds a default for every action', () => {
        // Guards the regex: without this, the table below would pass by
        // looking up keys that are simply absent.
        expect(defaults.size).toBe(ACTION_KEYS.length);
    });

    it.each([
        ['tile-left', 'Super+Ctrl+←'],
        ['tile-right', 'Super+Ctrl+→'],
        ['tile-center', 'Super+Ctrl+↑'],
        ['tile-maximize', 'Super+Ctrl+↓'],
        ['focus-left', 'Super+['],
        ['focus-right', 'Super+]'],
        ['swap-left', 'Super+Ctrl+['],
        ['swap-right', 'Super+Ctrl+]'],
        ['move-monitor-next', 'Super+Ctrl+M'],
        ['move-monitor-prev', 'Super+Ctrl+Shift+M'],
    ])('renders the %s default as %s', (key, expected) => {
        expect(acceleratorLabel(defaults.get(key))).toBe(expected);
    });

    it('renders modifiers in a fixed order, not the written one', () => {
        // prefs.js writes rebound shortcuts in GTK's order, so the two spellings
        // below both reach this function and must render identically.
        expect(acceleratorLabel('<Shift><Control><Super>m')).toBe(
            acceleratorLabel('<Super><Control><Shift>m'),
        );
    });

    it.each([
        ['<Primary>x', 'Ctrl+X'],
        ['<Mod4>x', 'Super+X'],
        ['<Mod1>x', 'Alt+X'],
        ['<Control>x', 'Ctrl+X'],
    ])('canonicalises %s to %s', (accelerator, expected) => {
        expect(acceleratorLabel(accelerator)).toBe(expected);
    });

    it.each([
        ['<Super>KP_Enter', 'Super+Enter'],
        ['<Super>Page_Up', 'Super+Page Up'],
        ['<Super>F5', 'Super+F5'],
        ['<Super>space', 'Super+Space'],
        ['<Super>Escape', 'Super+Esc'],
        ['<Super>comma', 'Super+,'],
        ['<Super>0x41', 'Super+0x41'],
        ['<Super>Menu', 'Super+Menu'],
    ])('renders %s as %s', (accelerator, expected) => {
        expect(acceleratorLabel(accelerator)).toBe(expected);
    });

    it('drops the release qualifier, which says when rather than what', () => {
        expect(acceleratorLabel('<Release><Super>x')).toBe('Super+X');
    });

    it('names a repeated modifier once', () => {
        expect(acceleratorLabel('<Control><Primary>x')).toBe('Ctrl+X');
    });

    it('keeps a modifier it does not recognise', () => {
        // Rendering it as "Super+X" would claim a shortcut that does not fire.
        expect(acceleratorLabel('<Super><Level3>x')).toContain('Level3');
    });

    it.each([
        ['', 'the empty string'],
        ['<Super>', 'modifiers with no key'],
        [null, 'null'],
        [undefined, 'undefined'],
        [42, 'a non-string'],
    ])('renders nothing for %s (%s)', accelerator => {
        expect(acceleratorLabel(accelerator)).toBe('');
    });
});

describe('parseAccelerator', () => {
    it('returns canonical modifiers in MODIFIER_ORDER', () => {
        const { modifiers } = parseAccelerator('<Shift><Super><Control>m');
        expect(modifiers).toEqual(['super', 'ctrl', 'shift']);
    });

    it('lower-cases the key name', () => {
        expect(parseAccelerator('<Super>Left').key).toBe('left');
    });

    it('orders every known modifier as MODIFIER_ORDER lists them', () => {
        const written = [...MODIFIER_ORDER].reverse().map(m => `<${m}>`);
        const { modifiers } = parseAccelerator(`${written.join('')}x`);
        expect(modifiers).toEqual([...MODIFIER_ORDER]);
    });
});

describe('bindingLabel', () => {
    it('reads the first accelerator, which is the one Mutter binds', () => {
        expect(bindingLabel(['<Super>Left', '<Super>Right'])).toBe('Super+←');
    });

    it.each([
        [[], 'an unbound action'],
        [[''], 'a cleared accelerator'],
        [null, 'a missing value'],
        [undefined, 'an absent value'],
    ])('renders nothing for %s (%s)', bindings => {
        expect(bindingLabel(bindings)).toBe('');
    });
});
