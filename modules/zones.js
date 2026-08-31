// Pure geometry for Tiler's zone set.
//
// This file imports nothing — not gi://, not resource:///. That is deliberate
// and load-bearing: it lets the whole of Tiler's branching logic be unit-tested
// with Vitest on plain Node, with no gnome-shell in the loop. Everything that
// needs Meta, Shell or St belongs in modules/tiler.js instead.

/**
 * The zone table, as fractions of a monitor's work area.
 *
 * Both target layouts — 1/4 + 1/2 + 1/4 and 1/2 + 1/2 — are span-merges of the
 * same four-column grid, so they need no separate "layout mode": they are just
 * different entries in one flat list.
 *
 * @type {ReadonlyArray<{id: string, group: string, x0: number, x1: number, y0: number, y1: number}>}
 */
export const ZONES = Object.freeze([
    { id: 'left-quarter', group: 'left', x0: 0, x1: 1 / 4, y0: 0, y1: 1 },
    { id: 'left-half', group: 'left', x0: 0, x1: 1 / 2, y0: 0, y1: 1 },
    { id: 'right-quarter', group: 'right', x0: 3 / 4, x1: 1, y0: 0, y1: 1 },
    { id: 'right-half', group: 'right', x0: 1 / 2, x1: 1, y0: 0, y1: 1 },
    { id: 'center-half', group: 'center', x0: 1 / 4, x1: 3 / 4, y0: 0, y1: 1 },
    { id: 'center-top', group: 'center', x0: 1 / 4, x1: 3 / 4, y0: 0, y1: 1 / 3 },
    { id: 'center-bottom', group: 'center', x0: 1 / 4, x1: 3 / 4, y0: 1 / 3, y1: 1 },
]);

/**
 * The order each direction key walks. Pressing a direction repeatedly advances
 * through its cycle and wraps.
 *
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const CYCLES = Object.freeze({
    left: Object.freeze(['left-quarter', 'left-half']),
    right: Object.freeze(['right-quarter', 'right-half']),
    center: Object.freeze(['center-half', 'center-top', 'center-bottom']),
});

const BY_ID = new Map(ZONES.map(zone => [zone.id, zone]));

// Looked up through a Map rather than by indexing CYCLES: a bare object index
// resolves inherited keys, so a group named 'constructor' or '__proto__' would
// return something that is not a cycle at all.
const CYCLE_BY_GROUP = new Map(Object.entries(CYCLES));

/**
 * Look up a zone by its id.
 *
 * @param {string} id Zone id.
 * @returns {object|undefined} The zone, or undefined if the id is unknown.
 */
export function zoneById(id) {
    return BY_ID.get(id);
}

/**
 * Project a zone onto a monitor work area, in frame coordinates.
 *
 * Gap handling: the work area is inset by a full gap, giving the screen-edge
 * margin, and each internal boundary is split so neighbours are exactly `gap`
 * apart. The split is floor/ceil rather than gap/2 so the result stays integral
 * for odd gaps — an odd gap is then asymmetric by one pixel, which is invisible,
 * where fractional pixels would let Mutter round two neighbours into an overlap.
 *
 * Boundaries are rounded once per fraction, so two zones that share a fraction
 * resolve to the identical pixel and leave no seam. Rounding each zone's edges
 * independently is what produces the classic one-pixel gap between thirds.
 *
 * @param {object} zone Zone from {@link ZONES}.
 * @param {{x: number, y: number, width: number, height: number}} workArea Monitor work area.
 * @param {number} [gap] Pixels between neighbouring windows and at the screen edge.
 * @returns {{x: number, y: number, width: number, height: number}} Frame rectangle.
 */
export function projectZone(zone, workArea, gap = 0) {
    const lo = Math.floor(gap / 2);
    const hi = gap - lo;

    const ax = workArea.x + gap;
    const ay = workArea.y + gap;
    const aw = Math.max(0, workArea.width - 2 * gap);
    const ah = Math.max(0, workArea.height - 2 * gap);

    // Only edges that abut another zone are pulled inward; edges on the screen
    // boundary already have their margin from the work-area inset above.
    const x = ax + Math.round(aw * zone.x0) + (zone.x0 > 0 ? hi : 0);
    const xEnd = ax + Math.round(aw * zone.x1) - (zone.x1 < 1 ? lo : 0);
    const y = ay + Math.round(ah * zone.y0) + (zone.y0 > 0 ? hi : 0);
    const yEnd = ay + Math.round(ah * zone.y1) - (zone.y1 < 1 ? lo : 0);

    return {
        x,
        y,
        width: Math.max(0, xEnd - x),
        height: Math.max(0, yEnd - y),
    };
}

/**
 * Identify which zone a window currently occupies.
 *
 * This is what makes Tiler stateless: the current zone is read back from the
 * window's own geometry on every keypress, so cycling works on windows that
 * were placed by something else, and there is no per-window table to leak or go
 * stale.
 *
 * The tolerance exists because applications do not always take the size they
 * are given — terminals snap to whole character cells, and some clients enforce
 * size increments or minimum sizes.
 *
 * @param {{x: number, y: number, width: number, height: number}} rect Window frame rectangle.
 * @param {{x: number, y: number, width: number, height: number}} workArea Monitor work area.
 * @param {number} [gap] The gap the zones were projected with.
 * @param {number} [tolerance] Maximum per-edge deviation, in pixels.
 * @returns {string|null} Zone id, or null if the window is in no zone.
 */
export function matchZone(rect, workArea, gap = 0, tolerance = 8) {
    let best = null;
    let bestDistance = Infinity;

    for (const zone of ZONES) {
        const candidate = projectZone(zone, workArea, gap);
        const deltas = [
            Math.abs(rect.x - candidate.x),
            Math.abs(rect.y - candidate.y),
            Math.abs(rect.width - candidate.width),
            Math.abs(rect.height - candidate.height),
        ];

        if (deltas.some(delta => delta > tolerance)) continue;

        // Pick the nearest match, not the first: a generous tolerance on a small
        // monitor can bring two zones into range at once, and "first in table
        // order" would make the result depend on an arbitrary declaration order.
        const distance = deltas.reduce((sum, delta) => sum + delta, 0);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = zone.id;
        }
    }

    return best;
}

/**
 * Advance to the next zone in a group's cycle.
 *
 * A window already in the group moves to the next entry and wraps; a window
 * anywhere else — including untiled — enters at the head of the cycle.
 *
 * @param {string|null} currentId Zone the window occupies now, or null.
 * @param {string} group Cycle to walk: 'left', 'right' or 'center'.
 * @returns {string|null} Zone id to move to, or null for an unknown group.
 */
export function nextZone(currentId, group) {
    const cycle = CYCLE_BY_GROUP.get(group);
    if (!cycle) return null;

    const index = cycle.indexOf(currentId);
    return index === -1 ? cycle[0] : cycle[(index + 1) % cycle.length];
}
