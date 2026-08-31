import { describe, expect, it } from 'vitest';

import { nearestNeighbour } from '../modules/neighbours.js';

const LEFT = -1;
const RIGHT = 1;

/**
 * A candidate at a given horizontal span.
 *
 * @param {number} seq Stable sequence number, standing in for Mutter's.
 * @param {number} x Left edge.
 * @param {number} width Width.
 * @returns {{seq: number, rect: object}} Candidate.
 */
const at = (seq, x, width = 100) => ({ seq, rect: { x, width } });

const origin = { x: 1000, width: 100 }; // centre 1050

describe('nearestNeighbour', () => {
    it('returns null when there are no candidates', () => {
        expect(nearestNeighbour(origin, [], RIGHT)).toBeNull();
    });

    it('picks the closest candidate to the right', () => {
        const near = at(1, 1200);
        const far = at(2, 3000);

        expect(nearestNeighbour(origin, [far, near], RIGHT)).toBe(near);
    });

    it('keeps the closest when a farther candidate arrives after it', () => {
        // The mirror of the case above. Both orderings matter, because the
        // caller iterates list_windows() and cannot control which comes first.
        const near = at(1, 1200);
        const far = at(2, 3000);

        expect(nearestNeighbour(origin, [near, far], RIGHT)).toBe(near);
    });

    it('picks the closest candidate to the left', () => {
        const near = at(1, 800);
        const far = at(2, 100);

        expect(nearestNeighbour(origin, [far, near], LEFT)).toBe(near);
    });

    it('ignores candidates on the wrong side', () => {
        expect(nearestNeighbour(origin, [at(1, 200), at(2, 400)], RIGHT)).toBeNull();
        expect(nearestNeighbour(origin, [at(1, 2000), at(2, 4000)], LEFT)).toBeNull();
    });

    it('measures from centres, not edges, so a wide window is not always nearest', () => {
        // Starts closer, but its centre is further away than the narrow one's.
        const wide = at(1, 1150, 2000);
        const narrow = at(2, 1300, 100);

        expect(nearestNeighbour(origin, [wide, narrow], RIGHT)).toBe(narrow);
    });

    it('finds a neighbour that overlaps the origin, so untiled windows work', () => {
        const overlapping = at(1, 1050, 100); // centre 1100, overlaps the origin

        expect(nearestNeighbour(origin, [overlapping], RIGHT)).toBe(overlapping);
    });

    describe('ties', () => {
        // Meta.Workspace.list_windows() has no documented stable ordering, so
        // resolving a tie by arrival order lets the target change between
        // identical keypresses.
        it('breaks a tie on the lowest seq, whichever order they arrive in', () => {
            const first = at(7, 1500);
            const second = at(3, 1500);

            expect(nearestNeighbour(origin, [first, second], RIGHT)).toBe(second);
            expect(nearestNeighbour(origin, [second, first], RIGHT)).toBe(second);
        });

        it('is stable across a shuffled candidate list', () => {
            const candidates = [at(9, 1500), at(2, 1500), at(5, 1500), at(4, 1500)];
            const expected = nearestNeighbour(origin, candidates, RIGHT);

            for (let i = 0; i < candidates.length; i++) {
                const rotated = [...candidates.slice(i), ...candidates.slice(0, i)];

                expect(nearestNeighbour(origin, rotated, RIGHT)).toBe(expected);
            }

            expect(expected.seq).toBe(2);
        });
    });

    // Current, deliberate behaviour rather than a desirable one. The comparison
    // is strictly horizontal, so two windows sharing a centre — center-top above
    // center-bottom, which is the arrangement the centre thirds exist for — are
    // not neighbours in either direction. Changing this needs a vertical axis,
    // and should update this test consciously rather than by accident.
    it('cannot reach a candidate whose centre coincides with the origin', () => {
        const stacked = at(1, 1000, 100);

        expect(nearestNeighbour(origin, [stacked], RIGHT)).toBeNull();
        expect(nearestNeighbour(origin, [stacked], LEFT)).toBeNull();
    });

    it('does not mutate the candidate list it is given', () => {
        const candidates = [at(2, 1500), at(1, 1200)];
        const snapshot = JSON.parse(JSON.stringify(candidates));

        nearestNeighbour(origin, candidates, RIGHT);

        expect(candidates).toEqual(snapshot);
    });
});
