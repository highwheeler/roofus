import { Board } from './Board.js';

/**
 * RIDGE MODULE - Plain JS Version v1.1
 * [2026-03-09] UPDATED: Integrated with Board.js and plain JS basis vectors.
 * FIXED: Vertical height (h) now scales with pitch to match rafter plumb cut.
 */
export class RidgeModule {
    static create(p1, p2, config) {
        const boards = [];
        const { 
            thick, 
            rafterDepth: rd, 
            slope
        } = config;

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.hypot(dx, dz);

        if (len < 0.1) return { boards };

        // Perpendicular vector for thickness
        const sideX = -dz / len;
        const sideZ = dx / len;

        const vAngle = Math.atan(slope);
        
        /**
         * The "Plumb Cut" depth of a rafter is: RafterDepth / cos(pitch).
         * h is the vertical dimension of the ridge board.
         */
        const h = rd / Math.cos(vAngle);
        
        // pDrop is the vertical bevel across the horizontal thickness
        const pDrop = thick * slope; 

        [-1, 1].forEach((sideDir) => {
            const getSection = (base) => {
                // 1. Inner Face (Centerline)
                const vInTop = { x: base.x, y: base.y, z: base.z };
                const vInBot = { x: base.x, y: base.y - h, z: base.z };
                
                // 2. Outer Face (Offset by thick)
                const offsetX = sideX * thick * sideDir;
                const offsetZ = sideZ * thick * sideDir;
                
                const vOutTop = { 
                    x: base.x + offsetX, 
                    y: base.y - pDrop, 
                    z: base.z + offsetZ 
                };
                
                const vOutBot = { 
                    x: base.x + offsetX, 
                    y: base.y - h, 
                    z: base.z + offsetZ 
                };

                return [vInTop, vInBot, vOutTop, vOutBot];
            };

            const s1 = getSection(p1); 
            const s2 = getSection(p2); 

            const verts = [
                s1[0], s1[1], // Inner Start
                s1[2], s1[3], // Outer Start
                s2[2], s2[3], // Outer End
                s2[0], s2[1]  // Inner End
            ];

            // Plain JS Basis Vectors
            const vLength = { x: dx / len, y: 0, z: dz / len };
            const vWidth = { x: 0, y: 1, z: 0 };
            const vThick = { x: sideX * sideDir, y: 0, z: sideZ * sideDir };

            const board = new Board(`ridge_${sideDir > 0 ? 'right' : 'left'}`, verts);
            
            // Assign metadata directly to userData for BOMReport
            board.userData = {
                memberType: 'Ridge',
                trueWidth: h,
                trueThick: thick,
                backingAngle: (vAngle * 180) / Math.PI,
                sourceVertices: verts,
                basis: {
                    length: vLength,
                    width: vWidth,
                    thick: vThick
                }
            };

            boards.push(board);
        });

        return { boards };
    }
}