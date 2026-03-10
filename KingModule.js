import * as THREE from 'three';

/**
 * KING MODULE - Plain JS Version
 * [2026-02-22] Always generates whole files.
 * FIXED: Interleaved vertex ordering [T0, B0, T1, B1, T2, B2, T3, B3] for Board class.
 * FIXED: Maintains "Mathematical Perfection" for Hip/King/Ridge miter.
 * UPDATED: [2026-02-26] Added sourceVertices and basis to userData for BOM accuracy.
 */
export class KingModule {
    static create(oPts, r1, r2, config) {
        const boards = [];
        const {  thick, rafterDepth: depth, slope } = config;

        const vAngle = Math.atan(slope);
        const vDepth = depth / Math.cos(vAngle);
        
        const dist = Math.hypot(r2.x - r1.x, r2.z - r1.z);
        const isPyramid = dist < 0.1;
        const ridgeIsX = Math.abs(r2.x - r1.x) >= Math.abs(r2.z - r1.z);

        const endpoints = [r1, r2];
        endpoints.forEach((peak, idx) => {
            const dirs = [
                { x: 1, z: 0, type: 'axial' }, 
                { x: -1, z: 0, type: 'axial' },
                { x: 0, z: 1, type: 'side' }, 
                { x: 0, z: -1, type: 'side' }
            ];

            dirs.forEach(d => {
                if (!isPyramid) {
                    if (ridgeIsX) {
                        if (idx === 0 && d.x === 1) return; 
                        if (idx === 1 && d.x === -1) return;
                        if (d.type === 'side') return; 
                    } else {
                        if (idx === 0 && d.z === 1) return;
                        if (idx === 1 && d.z === -1) return;
                        if (d.type === 'axial') return;
                    }
                } else if (idx === 1) return;

                boards.push(this.buildKingHalf(peak, d, config, vDepth, -1));
                boards.push(this.buildKingHalf(peak, d, config, vDepth, 1));
            });
        });

        return { boards };
    }

    static buildKingHalf(peak, d, config, vDepth, sideDir) {
        const { thick, wallRun, overhang, slope, rafterDepth } = config;
        
        const hSide = { x: -d.z, z: d.x };
        const totalRun = wallRun + overhang;
        
        const insideNose = thick * Math.SQRT2;
        const outsideNose = insideNose + thick;

        const getV = (runDist, sOff) => {
            const px = peak.x + (d.x * runDist) + (hSide.x * sOff * sideDir);
            const pz = peak.z + (d.z * runDist) + (hSide.z * sOff * sideDir);
            const py = peak.y - (runDist * slope);

            return [
                { x: px, y: py, z: pz },         // Top Vertex
                { x: px, y: py - vDepth, z: pz } // Bottom Vertex
            ];
        };

        const [t0, b0] = getV(insideNose, 0);     // Inside Nose (Peak)
        const [t1, b1] = getV(outsideNose, thick); // Outside Nose (Miter)
        const [t2, b2] = getV(totalRun, thick);    // Outside Eave (Tail)
        const [t3, b3] = getV(totalRun, 0);        // Inside Eave (Tail)

        const verts = [
            t0, b0, 
            t1, b1, 
            t2, b2, 
            t3, b3
        ];

        // --- BASIS LOGIC FOR BOM ---
        // Length Axis: Follows the pitch of the king rafter
        const vLength = new THREE.Vector3(d.x, -slope, d.z).normalize();
        // Thickness Axis: Perpendicular to the run direction
        const vThick = new THREE.Vector3(hSide.x * sideDir, 0, hSide.z * sideDir).normalize();
        // Width Axis: Perpendicular to Length and Thickness (the "face" of the board)
        const vWidth = new THREE.Vector3().crossVectors(vLength, vThick).normalize();

        // Calculate tip-to-tip length for the BOM record
        const boardLength = Math.sqrt(Math.pow(totalRun - insideNose, 2) + Math.pow((totalRun - insideNose) * slope, 2));

        return {
            id: `king_side_${sideDir}_${d.x}_${d.z}`,
            userData: {
                memberType: 'king_rafter',
                trueLength: boardLength,
                trueWidth: rafterDepth,
                trueThick: thick,
                sourceVertices: verts,
                basis: {
                    length: vLength,
                    width: vWidth,
                    thick: vThick
                }
            },
            vertices: verts
        };
    }
}