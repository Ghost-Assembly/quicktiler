import { describe, expect, it } from 'vitest';

import * as zones from '../modules/zones.js';
import {
    CYCLES,
    ZONES,
    matchZone,
    nextZone,
    projectZone,
    zoneById,
} from '../modules/zones.js';

// The development target: one 3840x1600 ultrawide with no panel struts.
const WA = { x: 0, y: 0, width: 3840, height: 1600 };

const project = (id, workArea, gap) => projectZone(zoneById(id), workArea, gap);

describe('projectZone', () => {
    it.each([
        ['left-quarter', { x: 0, y: 0, width: 960, height: 1600 }],
        ['left-half', { x: 0, y: 0, width: 1920, height: 1600 }],
        ['right-quarter', { x: 2880, y: 0, width: 960, height: 1600 }],
        ['right-half', { x: 1920, y: 0, width: 1920, height: 1600 }],
        ['center-half', { x: 960, y: 0, width: 1920, height: 1600 }],
        ['center-top', { x: 960, y: 0, width: 1920, height: 533 }],
        ['center-bottom', { x: 960, y: 533, width: 1920, height: 1067 }],
    ])('places %s exactly with no gap', (id, expected) => {
        expect(project(id, WA, 0)).toEqual(expected);
    });

    it.each([
        ['left-quarter', { x: 8, y: 8, width: 952, height: 1584 }],
        ['left-half', { x: 8, y: 8, width: 1908, height: 1584 }],
        ['right-quarter', { x: 2880, y: 8, width: 952, height: 1584 }],
        ['right-half', { x: 1924, y: 8, width: 1908, height: 1584 }],
        ['center-half', { x: 968, y: 8, width: 1904, height: 1584 }],
        ['center-top', { x: 968, y: 8, width: 1904, height: 524 }],
        ['center-bottom', { x: 968, y: 540, width: 1904, height: 1052 }],
    ])('places %s exactly with an 8px gap', (id, expected) => {
        expect(project(id, WA, 8)).toEqual(expected);
    });

    it('offsets every zone by a monitor origin left of the primary', () => {
        const left = { x: -1920, y: -200, width: 1920, height: 1080 };

        expect(project('left-half', left, 0)).toEqual({
            x: -1920,
            y: -200,
            width: 960,
            height: 1080,
        });
    });
});

describe('zone tiling', () => {
    it('covers the work area exactly with quarter + center + quarter', () => {
        const l = project('left-quarter', WA, 0);
        const c = project('center-half', WA, 0);
        const r = project('right-quarter', WA, 0);

        expect(l.x).toBe(WA.x);
        expect(l.x + l.width).toBe(c.x);
        expect(c.x + c.width).toBe(r.x);
        expect(r.x + r.width).toBe(WA.x + WA.width);
    });

    it('covers the work area exactly with half + half', () => {
        const l = project('left-half', WA, 0);
        const r = project('right-half', WA, 0);

        expect(l.x).toBe(WA.x);
        expect(l.x + l.width).toBe(r.x);
        expect(r.x + r.width).toBe(WA.x + WA.width);
    });

    it('splits the center into thirds with no seam and no lost pixel', () => {
        const top = project('center-top', WA, 0);
        const bottom = project('center-bottom', WA, 0);

        expect(top.y + top.height).toBe(bottom.y);
        expect(top.height + bottom.height).toBe(WA.height);
    });

    it('leaves exactly one gap between neighbors and at the screen edge', () => {
        const gap = 8;
        const l = project('left-quarter', WA, gap);
        const c = project('center-half', WA, gap);
        const r = project('right-quarter', WA, gap);

        expect(l.x - WA.x).toBe(gap);
        expect(c.x - (l.x + l.width)).toBe(gap);
        expect(r.x - (c.x + c.width)).toBe(gap);
        expect(WA.x + WA.width - (r.x + r.width)).toBe(gap);
    });

    it('leaves exactly one gap between the center thirds', () => {
        const gap = 8;
        const top = project('center-top', WA, gap);
        const bottom = project('center-bottom', WA, gap);

        expect(bottom.y - (top.y + top.height)).toBe(gap);
    });

    it('splits an odd gap without overlapping or leaving a seam', () => {
        const gap = 7;
        const l = project('left-quarter', WA, gap);
        const c = project('center-half', WA, gap);

        expect(c.x - (l.x + l.width)).toBe(gap);
    });
});

describe('projectZone degenerate input', () => {
    it('never returns a negative dimension for a zero-size work area', () => {
        const empty = { x: 0, y: 0, width: 0, height: 0 };

        for (const zone of ZONES) {
            const rect = projectZone(zone, empty, 0);

            expect(rect.width).toBeGreaterThanOrEqual(0);
            expect(rect.height).toBeGreaterThanOrEqual(0);
        }
    });

    it('never returns a negative dimension when the gap exceeds the work area', () => {
        for (const zone of ZONES) {
            const rect = projectZone(zone, WA, 4000);

            expect(rect.width).toBeGreaterThanOrEqual(0);
            expect(rect.height).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('matchZone', () => {
    it.each(ZONES.map(z => z.id))('round-trips %s', id => {
        expect(matchZone(project(id, WA, 8), WA, 8)).toBe(id);
    });

    it('still matches a window that missed the zone by less than the tolerance', () => {
        const rect = project('center-half', WA, 0);
        const drifted = { ...rect, width: rect.width - 6, height: rect.height - 6 };

        expect(matchZone(drifted, WA, 0, 8)).toBe('center-half');
    });

    it('returns null for a window that is not in any zone', () => {
        expect(
            matchZone({ x: 700, y: 300, width: 640, height: 480 }, WA, 0),
        ).toBeNull();
    });

    it('picks the closest zone rather than the first when two are within tolerance', () => {
        const halfRect = project('left-half', WA, 0);
        const nudged = { ...halfRect, width: halfRect.width + 2 };

        expect(matchZone(nudged, WA, 0, 2000)).toBe('left-half');
    });
});

// Mutter enlarges a window to its minimum size and keeps the origin it was
// given, so a window too big for a zone ends up anchored where that zone is but
// larger than it. An exact match can never find such a window, and cycling then
// restarted at the head of the cycle on every press: center-half to center-top,
// enlarged, back to center-half, forever.
describe('matchZone for a window enlarged to its minimum size', () => {
    const FHD = { x: 0, y: 0, width: 1920, height: 1080 };
    const GAP = 8;

    /** A zone's projection, grown to at least a minimum size. */
    const clamped = (id, minWidth, minHeight) => {
        const rect = project(id, FHD, GAP);
        return {
            ...rect,
            width: Math.max(rect.width, minWidth),
            height: Math.max(rect.height, minHeight),
        };
    };

    it('recognizes center-top grown taller than a third', () => {
        expect(matchZone(clamped('center-top', 0, 500), FHD, GAP)).toBe('center-top');
    });

    it('recognizes left-quarter grown wider than a quarter', () => {
        expect(matchZone(clamped('left-quarter', 600, 0), FHD, GAP)).toBe(
            'left-quarter',
        );
    });

    it('recognizes a zone that does not start at the work area origin', () => {
        expect(matchZone(clamped('center-bottom', 0, 900), FHD, GAP)).toBe(
            'center-bottom',
        );
    });

    // center-top and center-half share an origin. A window at least as tall as
    // center-half fits both descriptions; the smaller zone is the one that
    // must have been enlarged, and choosing it is what lets the center cycle
    // move on to center-bottom instead of re-placing the same frame forever.
    it('prefers the smallest zone when the frame covers several at one anchor', () => {
        expect(matchZone(clamped('center-top', 0, 1100), FHD, GAP)).toBe('center-top');
    });

    it('does not claim a window smaller than the zone at its anchor', () => {
        const rect = project('center-half', FHD, GAP);

        expect(matchZone({ ...rect, height: 200 }, FHD, GAP)).toBeNull();
    });

    it('does not claim a large window at no zone anchor', () => {
        expect(
            matchZone({ x: 300, y: 200, width: 1500, height: 900 }, FHD, GAP),
        ).toBeNull();
    });
});

describe('nextZone', () => {
    it.each([
        ['left', ['left-quarter', 'left-half']],
        ['right', ['right-quarter', 'right-half']],
        ['center', ['center-half', 'center-top', 'center-bottom']],
    ])('cycles the %s group in order and wraps', (group, order) => {
        const walked = order.map(id => nextZone(id, group));

        expect(walked).toEqual([...order.slice(1), order[0]]);
    });

    it('enters at the head of the cycle when the window is in a foreign zone', () => {
        expect(nextZone('right-half', 'left')).toBe('left-quarter');
    });

    it('enters at the head of the cycle when the window is untiled', () => {
        expect(nextZone(null, 'center')).toBe('center-half');
    });

    it('exposes a cycle for every group named in the zone table', () => {
        for (const zone of ZONES) expect(CYCLES[zone.group]).toContain(zone.id);
    });
});

describe('module surface', () => {
    // MATCH_TOLERANCE is matchZone's own default; nothing outside this file
    // needs it, so it stays file-local rather than part of the public API.
    it('keeps MATCH_TOLERANCE file-local', () => {
        expect(zones).not.toHaveProperty('MATCH_TOLERANCE');
    });
});
