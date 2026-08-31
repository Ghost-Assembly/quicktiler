import js from '@eslint/js';
import globals from 'globals';
import security from 'eslint-plugin-security';

// GJS globals. `eslint-config-gjs` and `eslint-plugin-gjs` were both last
// published in 2022 and fail our maintenance bar, so the globals are declared
// here rather than pulled from an unmaintained package.
const gjsGlobals = {
    ARGV: 'readonly',
    imports: 'readonly',
    globalThis: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    pkg: 'readonly',
    _: 'readonly',
    C_: 'readonly',
    N_: 'readonly',
};

export default [
    { ignores: ['node_modules/', 'coverage/', 'schemas/'] },
    js.configs.recommended,
    security.configs.recommended,
    {
        // Extension code: runs inside gnome-shell's GJS, not Node.
        files: ['extension.js', 'prefs.js', 'modules/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...gjsGlobals, ...globals.browser, global: 'readonly' },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
    {
        // Tooling and tests: run on Node.
        files: ['tests/**/*.js', '*.config.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: globals.node,
        },
    },
];
