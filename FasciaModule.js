/**
 * FASCIA MODULE
 * [2026-02-22] Always generates whole files.
 * FLUSH FIT: Path is offset by fasciaThick so the inner face meets rafter ends.
 * MITERED: Corners use bisector logic for perfect joints.
 */
export class FasciaModule {
    static create(oPts, config) {
        const boards = [];
        const { fasciaDepth: depth, fasciaThick: thick } = config;
        const count = oPts.length;

        // Helper to get miter offset vector at a specific corner
        const getMiterOffset = (prev, curr, next, thickness) => {
            const v1 = { x: curr.x - prev.x, z: curr.z - prev.z };
            const L1 = Math.hypot(v1.x, v1.z);
            const n1 = { x: v1.x / L1, z: v1.z / L1 };

            const v2 = { x: next.x - curr.x, z: next.z - curr.z };
            const L2 = Math.hypot(v2.x, v2.z);
            const n2 = { x: v2.x / L2, z: v2.z / L2 };

            const segmentDir = n1;
            const segmentNorm = { x: segmentDir.z, z: -segmentDir.x };

            const bisector = { x: n1.x - n2.x, z: n1.z - n2.z };
            const bLen = Math.hypot(bisector.x, bisector.z);
            
            if (bLen < 0.001) {
                return { x: segmentNorm.x * thickness, z: segmentNorm.z * thickness };
            }

            const bNorm = { x: bisector.x / bLen, z: bisector.z / bLen };
            const cosTheta = Math.abs(bNorm.x * segmentNorm.x + bNorm.z * segmentNorm.z);
            const miterLen = thickness / cosTheta;

            return { x: bNorm.x * miterLen, z: bNorm.z * miterLen };
        };

        oPts.forEach((p1, i) => {
            const p2 = oPts[(i + 1) % count];
            const pPrev = oPts[(i - 1 + count) % count];
            const pNext = oPts[(i + 2) % count];

            // Calculate miter offsets for the inner face transition
            const offset1 = getMiterOffset(pPrev, p1, p2, thick);
            const offset2 = getMiterOffset(p1, p2, pNext, thick);

            /**
             * FLUSH LOGIC: 
             * oPts represents the rafter tips. 
             * To make the inner face flush, the 'Outer' vertices are p + offset.
             * The 'Inner' vertices are exactly at p.
             */
            const v = (x, y, z) => ({ x, y, z });

            // p1 side (Start of board)
            const vInTop1  = v(p1.x, p1.y, p1.z);
            const vInBot1  = v(p1.x, p1.y - depth, p1.z);
            const vOutTop1 = v(p1.x + offset1.x, p1.y, p1.z + offset1.z);
            const vOutBot1 = v(p1.x + offset1.x, p1.y - depth, p1.z + offset1.z);

            // p2 side (End of board)
            const vInTop2  = v(p2.x, p2.y, p2.z);
            const vInBot2  = v(p2.x, p2.y - depth, p2.z);
            const vOutTop2 = v(p2.x + offset2.x, p2.y, p2.z + offset2.z);
            const vOutBot2 = v(p2.x + offset2.x, p2.y - depth, p2.z + offset2.z);

            boards.push({
                id: `fascia_${i}`,
                // Perimeter winding: Out1 -> In1 -> In2 -> Out2
                vertices: [
                    vOutTop1, vOutBot1, 
                    vOutTop2, vOutBot2,
                    vInTop1,  vInBot1, 
                    vInTop2,  vInBot2
                ]
            });
        });

        return { boards };
    }
}