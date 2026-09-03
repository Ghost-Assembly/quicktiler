// Pure neighbour selection: which window lies next to another, in a direction.
//
// This file imports nothing — not gi://, not resource:/// — like modules/zones.js
// and modules/windows.js, so Vitest runs it on plain Node.
//
// It lives here rather than inline in modules/quicktiler.js because it is the one
// piece of real arithmetic the Shell layer had left, and it decides where focus
// goes and which two windows a swap exchanges. Getting it wrong is quiet: the
// shortcut moves focus somewhere unexpected, or nowhere, and logs nothing.

/**
 * The horizontal centre of a rectangle.
 *
 * @param {{x: number, width: number}} rect Rectangle.
 * @returns {number} Centre on the x axis.
 */
function centreX(rect) {
    return rect.x + rect.width / 2;
}

/**
 * Choose the nearest candidate to one side of an origin rectangle.
 *
 * Compares frame-rect centres rather than zones, so it works for windows that
 * were never tiled.
 *
 * Candidates whose centre coincides with the origin's are not reachable: the
 * comparison is strictly to one side, so two windows stacked in the same zone —
 * `center-top` above `center-bottom`, say — are not neighbours of each other in
 * this axis. Moving between those needs a vertical axis, which QuickTiler does not
 * bind yet.
 *
 * Ties are broken on `seq`, not on the order candidates arrive in. Mutter's
 * Meta.Workspace.list_windows() has no documented stable ordering, so "first
 * one seen wins" would let two equidistant windows swap places between
 * identical keypresses.
 *
 * @param {{x: number, width: number}} origin Rectangle to search out from.
 * @param {ReadonlyArray<{rect: {x: number, width: number}, seq: number}>} candidates
 *   Eligible candidates. The caller is responsible for excluding the origin
 *   itself and anything policy forbids.
 * @param {number} direction -1 for left, 1 for right.
 * @returns {object|null} The winning candidate, or null if there is none.
 */
export function nearestNeighbour(origin, candidates, direction) {
    const from = centreX(origin);

    let best = null;
    let bestDistance = Infinity;

    for (const candidate of candidates) {
        const distance = (centreX(candidate.rect) - from) * direction;

        // Strictly positive: a candidate level with the origin is not to either
        // side of it, and one behind is in the wrong direction entirely.
        if (distance <= 0) continue;

        if (distance > bestDistance) continue;
        if (distance === bestDistance && candidate.seq >= best.seq) continue;

        bestDistance = distance;
        best = candidate;
    }

    return best;
}
