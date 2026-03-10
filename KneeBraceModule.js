import { Board } from './Board.js';

/**
 * KNEE BRACE MODULE v1.9.1
 * [2026-03-09] UPDATED: Removed THREE.js dependency and corrected Board property access.
 * FIXED: Metadata is now applied directly to board.userData.
 */
export class KneeBraceModule {
    static create(wallPts, config) {
        const boards = [];
        const postThick = config.postThickness || 6;
        const postHeight = config.postHeight || 96;
        const beamDepth = config.beamDepth || 9.25;
        const braceThick = config.braceThickness || 3.5;
        const braceWidth = config.braceWidth || 5.5;
        const braceOffset = config.braceOffset || 24; 

        const minX = Math.min(...wallPts.map(p => p.x));
        const minZ = Math.min(...wallPts.map(p => p.z));

        for (let i = 0; i < wallPts.length; i++) {
            const p1 = wallPts[i];
            const p2 = wallPts[(i + 1) % wallPts.length];
            const segmentDist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2));

            const isXWall = Math.abs(p2.x - p1.x) > Math.abs(p2.z - p1.z);
            const dx = (p2.x - p1.x) / segmentDist;
            const dz = (p2.z - p1.z) / segmentDist;
            
            // Normals for thickness extrusion
            const normX = -dz;
            const normZ = dx;

            let maxSpan = (postThick >= 8) ? 192 : (postThick >= 6 ? 144 : 96);
            const postRatios = [0, 1]; 
            if (segmentDist > maxSpan) {
                const intermediateCount = Math.ceil(segmentDist / maxSpan) - 1;
                for (let j = 1; j <= intermediateCount; j++) postRatios.push(j / (intermediateCount + 1));
            }

            postRatios.forEach(r => {
                const rawPt = { x: p1.x + (p2.x - p1.x) * r, z: p1.z + (p2.z - p1.z) * r };
                
                const ptDx = (rawPt.x <= minX + 0.1) ? 1 : -1;
                const ptDz = (rawPt.z <= minZ + 0.1) ? 1 : -1;
                const postCenterX = rawPt.x + (isXWall ? (postThick / 2) * ptDx : 0);
                const postCenterZ = rawPt.z + (isXWall ? 0 : (postThick / 2) * ptDz);

                const beamBottomY = postHeight - beamDepth;
                const faceOff = postThick / 2;

                [-1, 1].forEach(dir => {
                    const targetDist = (r * segmentDist) + (dir * braceOffset);
                    if (targetDist < -0.01 || targetDist > segmentDist + 0.01) return;

                    const startX = postCenterX + (dx * dir * faceOff);
                    const startZ = postCenterZ + (dz * dir * faceOff);

                    const leg = braceOffset - faceOff;
                    const wShift = braceWidth * Math.SQRT2;

                    const corners = [
                        { l: 0,            v: -wShift }, 
                        { l: 0,            v: 0 },       
                        { l: leg,          v: leg },     
                        { l: leg + wShift, v: leg }      
                    ];

                    const v = [];
                    corners.forEach(c => {
                        const fx = startX + (dx * dir * c.l);
                        const fy = beamBottomY - leg + c.v;
                        const fz = startZ + (dz * dir * c.l);
                        
                        // FRONT POINT
                        v.push({ x: fx, y: fy, z: fz });

                        // BACK POINT (Extruded by braceThick)
                        v.push({
                            x: fx + (normX * -braceThick),
                            y: fy,
                            z: fz + (normZ * -braceThick)
                        });
                    });

                    // --- BASIS CALCULATION (Plain JS) ---
                    // The BOMReport uses these to project vertices. 
                    // For a 45-degree brace, the length axis is the diagonal.
                    const magL = Math.sqrt(dx * dx + 1 + dz * dz);
                    const axisL = { x: (dx * dir) / magL, y: 1 / magL, z: (dz * dir) / magL };
                    
                    const axisW = { x: (dx * dir) / magL, y: -1 / magL, z: (dz * dir) / magL };
                    
                    const magT = Math.sqrt(normX * normX + normZ * normZ);
                    const axisT = { x: -normX / magT, y: 0, z: -normZ / magT };

                    const board = new Board(`brace_${i}_${r}_${dir}`, v);
                    
                    // Assigning to board.userData directly
                    if (!board.userData) board.userData = {};
                    
                    board.userData.memberType = 'Knee Brace';
                    board.userData.trueWidth = braceWidth;
                    board.userData.trueThick = braceThick;
                    board.userData.sourceVertices = v;
                    board.userData.basis = {
                        length: axisL,
                        width:  axisW,
                        thick:  axisT
                    };

                    boards.push(board);
                });
            });
        }
        return { boards };
    }
}