import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            // Only the pure logic layer is unit-testable off-shell; the rest
            // needs a live gnome-shell and is covered by scripts/headless-check.sh.
            include: ['modules/zones.js'],
        },
    },
});
