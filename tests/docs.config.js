// What tests/docs.spec.js holds QuickTiler's docs site to. The spec is shared
// across the extensions; this file is QuickTiler's own.

export default {
    title: 'QuickTiler',
    site: 'https://ghost-assembly.com/quicktiler/',
    repo: 'https://github.com/Ghost-Assembly/quicktiler',

    // [id, heading], in page order. The contents list must match.
    sections: [
        ['overview', 'Overview'],
        ['install', 'Install'],
        ['zones', 'Zones'],
        ['quick-settings', 'Quick Settings'],
        ['preferences', 'Preferences'],
        ['shortcuts', 'Shortcuts'],
        ['architecture', 'Architecture'],
        ['testing', 'Testing'],
        ['packaging', 'Packaging'],
        ['releasing', 'Releasing'],
        ['development', 'Development'],
    ],
};
