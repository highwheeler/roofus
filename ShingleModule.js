/**
 * SHINGLE MODULE v20.1 (Solid Cover)
 * [2026-02-22] Always generates whole files.
 * FIXED: Mapping to correct ridge points using closest-point projection.
 */
export class ShingleModule {
    static create(oPts, r1, r2, config) {
        const boards = [];
        const { sheathingThickness = 0.5, shingleThickness = 5 } = config;
        const lift = sheathingThickness + 5;

        // Ridge vector for projection
        const ridgeVec = { x: r2.x - r1.x, z: r2.z - r1.z };
        const ridgeLenSq = ridgeVec.x ** 2 + ridgeVec.z ** 2;

        const projectToRidge = (pt) => {
            if (ridgeLenSq === 0) return r1;
            // Linear projection to find the point on the ridge line closest to pt
            let t = ((pt.x - r1.x) * ridgeVec.x + (pt.z - r1.z) * ridgeVec.z) / ridgeLenSq;
            // Clamp t between 0 and 1 to stay on the ridge beam
            t = Math.max(0, Math.min(1, t));
            return {
                x: r1.x + t * ridgeVec.x,
                y: r1.y, // Ridge height is constant
                z: r1.z + t * ridgeVec.z
            };
        };

        oPts.forEach((p1, i) => {
            const p2 = oPts[(i + 1) % oPts.length];
            
            // Find the points on the ridge that correspond to our eave corners
            const rStart = projectToRidge(p1);
            const rEnd = projectToRidge(p2);

            const v = (pt, isTop) => ({
                x: pt.x,
                y: pt.y + lift + (isTop ? shingleThickness : 0),
                z: pt.z
            });

            // We construct the face using 4 points (8 vertices for the prism)
            // If rStart and rEnd are the same (like at a hip peak), 
            // the Board class handles it as a triangle.
            const vertices = [
                v(p1, true), v(p1, false),     // Eave Start
                v(p2, true), v(p2, false),     // Eave End
                v(rEnd, true), v(rEnd, false), // Ridge End Projection
                v(rStart, true), v(rStart, false) // Ridge Start Projection
            ];

            boards.push({
                id: `shingle_cover_${i}`,
                vertices: vertices
            });
        });

        return { boards };
    }
}