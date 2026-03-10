import { Board } from './Board.js';

/**
 * SUPPORTING BEAM MODULE v17.6
 * [2026-03-09] FIXED: Refined Basis to prevent false angled-cut reports in BOM.
 * GEOMETRY: Interleaved pairs [Top, Bot] for solid enclosure.
 */
export class SupportingBeamModule {
    static create(wallPts, config) {
        const boards = [];
        const beamDepth = config.beamDepth || 9.25; 
        const beamThick = config.beamThickness || 3.5;
        const postHeight = config.postHeight || 96;
        const thick = config.postThickness || 6;
        const slope = config.slope || 0.25; 

        let maxSpan = (thick > 8) ? 192 : (thick > 6 ? 144 : 96);
        const minX = Math.min(...wallPts.map(p => p.x));
        const minZ = Math.min(...wallPts.map(p => p.z));

        for (let i = 0; i < wallPts.length; i++) {
            const p1 = wallPts[i];
            const p2 = wallPts[(i + 1) % wallPts.length];
            const pPrev = wallPts[(i - 1 + wallPts.length) % wallPts.length];
            const pNextNext = wallPts[(i + 2) % wallPts.length];

            const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2));
            const segmentCount = Math.ceil(dist / maxSpan);
            
            const dx = (p2.x - p1.x) / dist;
            const dz = (p2.z - p1.z) / dist;
            const nx = -dz; 
            const nz = dx;

            const isXWall = Math.abs(p2.x - p1.x) > Math.abs(p2.z - p1.z);
            const getCenteredJoint = (pt) => {
                const ptDx = (pt.x <= minX + 0.1) ? 1 : -1;
                const ptDz = (pt.z <= minZ + 0.1) ? 1 : -1;
                return {
                    x: pt.x + (isXWall ? (thick / 2) * ptDx : 0),
                    z: pt.z + (isXWall ? 0 : (thick / 2) * ptDz)
                };
            };

            for (let s = 0; s < segmentCount; s++) {
                const rS = s / segmentCount;
                const rE = (s + 1) / segmentCount;

                const outS = (s === 0) ? p1 : getCenteredJoint({ x: p1.x + (p2.x - p1.x) * rS, z: p1.z + (p2.z - p1.z) * rS });
                const outE = (s === segmentCount - 1) ? p2 : getCenteredJoint({ x: p1.x + (p2.x - p1.x) * rE, z: p1.z + (p2.z - p1.z) * rE });

                const inS = (s === 0) ? this.getMiterPoint(pPrev, outS, p2, beamThick) : 
                            { x: outS.x + nx * -beamThick, z: outS.z + nz * -beamThick };
                const inE = (s === segmentCount - 1) ? this.getMiterPoint(p1, outE, pNextNext, beamThick) : 
                            { x: outE.x + nx * -beamThick, z: outE.z + nz * -beamThick };

                const yBot = postHeight - beamDepth;
                const yTopOut = postHeight;
                const yTopIn  = postHeight + (beamThick * slope);

                const vertices = [
                    { x: outS.x, y: yTopOut, z: outS.z }, { x: outS.x, y: yBot, z: outS.z }, 
                    { x: inS.x,  y: yTopIn,  z: inS.z  }, { x: inS.x,  y: yBot, z: inS.z  }, 
                    { x: inE.x,  y: yTopIn,  z: inE.z  }, { x: inE.x,  y: yBot, z: inE.z  }, 
                    { x: outE.x, y: yTopOut, z: outE.z }, { x: outE.x, y: yBot, z: outE.z }  
                ];

                const board = new Board(`beam_${i}_seg_${s}`, vertices);
                
                // REFINED BASIS: 
                // We use the actual vector between segment start and end for length.
                const segDX = outE.x - outS.x;
                const segDZ = outE.z - outS.z;
                const segLen = Math.hypot(segDX, segDZ);

                board.userData = {
                    memberType: 'Supporting Beam',
                    trueWidth: beamDepth,
                    trueThick: beamThick,
                    sourceVertices: vertices,
                    basis: {
                        length: { x: segDX / segLen, y: 0, z: segDZ / segLen },
                        width:  { x: 0, y: 1, z: 0 },
                        thick:  { x: nx, y: 0, z: nz }
                    }
                };
                boards.push(board);
            }
        }
        return { boards };
    }

    static getMiterPoint(prev, curr, next, thickness) {
        const v1 = { x: curr.x - prev.x, z: curr.z - prev.z };
        const v2 = { x: next.x - curr.x, z: next.z - curr.z };
        const L1 = Math.hypot(v1.x, v1.z), L2 = Math.hypot(v2.x, v2.z);
        if (L1 < 0.001 || L2 < 0.001) return { x: curr.x, z: curr.z };

        const n1 = { x: -v1.z / L1, z: v1.x / L1 };
        const n2 = { x: -v2.z / L2, z: v2.x / L2 };
        const dot = n1.x * n2.x + n1.z * n2.z;
        
        if (dot < -0.999) return { x: curr.x + n2.x * -thickness, z: curr.z + n2.z * -thickness };

        const bx = n1.x + n2.x;
        const bz = n1.z + n2.z;
        const k = 1 / (1 + dot);
        
        return { 
            x: curr.x + bx * k * -thickness, 
            z: curr.z + bz * k * -thickness 
        };
    }
}