// What tests/docs.spec.js holds QuickTiler's docs site to. The spec is shared
// across the extensions; this file is QuickTiler's own.

export default {
    title: 'QuickTiler',
    site: 'https://ghost-assembly.github.io/quicktiler/',
    repo: 'https://github.com/Ghost-Assembly/quicktiler',

    // [id, heading], in page order. The contents list must match.
    sections: [
        ['overview', 'Overview'],
        ['install', 'Install'],
        ['zones', 'Zones'],
        ['shortcuts', 'Shortcuts'],
        ['quick-settings', 'Quick settings'],
        ['preferences', 'Preferences'],
        ['architecture', 'Architecture'],
        ['testing', 'Testing'],
        ['packaging', 'Packaging'],
        ['releasing', 'Releasing'],
        ['development', 'Development'],
    ],
};
