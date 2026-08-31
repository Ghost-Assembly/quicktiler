import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            // Every module that imports nothing is unit-testable off-shell and
            // belongs here. The rest needs a live gnome-shell. Listing only some
            // of the pure modules silently drops their coverage from the lcov
            // that sonar.yml consumes, which is how windows.js came to report
            // nothing despite having a full suite.
            include: [
                'modules/actions.js',
                'modules/neighbours.js',
                'modules/windows.js',
                'modules/zones.js',
            ],
        },
    },
});
