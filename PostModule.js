import { Board } from './Board.js';

/**
 * POST MODULE v17.1
 * [2026-03-09] UPDATED: Added BOM metadata (basis, trueWidth, trueThick) to userData.
 * GEOMETRY: 2-board assembly with specialized notches.
 */
export class PostModule {
    static create(wallPts, config) {
        const boards = [];
        const height = config.postHeight || 96;
        const thick = config.postThickness || 6;
        const beamThick = config.beamThickness || 3.5;
        const beamDepth = config.beamDepth || 9.25;
        
        const sheathingEnabled = config.sheathingEnabled ?? true;

        let maxSpan = 96; 
        if (thick >= 6) maxSpan = 144; 
        if (thick >= 8) maxSpan = 192; 

        const postPositions = [];
        for (let i = 0; i < wallPts.length; i++) {
            const p1 = wallPts[i];
            const p2 = wallPts[(i + 1) % wallPts.length];
            
            postPositions.push({ ...p1, isIntermediate: false, nextPt: p2 });

            const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2));
            if (dist > maxSpan) {
                const intermediateCount = Math.ceil(dist / maxSpan) - 1;
                for (let j = 1; j <= intermediateCount; j++) {
                    const ratio = j / (intermediateCount + 1);
                    postPositions.push({
                        x: p1.x + (p2.x - p1.x) * ratio,
                        z: p1.z + (p2.z - p1.z) * ratio,
                        isIntermediate: true,
                        nextPt: p2
                    });
                }
            }
        }

        const minX = Math.min(...wallPts.map(p => p.x));
        const minZ = Math.min(...wallPts.map(p => p.z));

        // Shared Basis for vertical posts
        const postBasis = {
            length: { x: 0, y: 1, z: 0 }, // Length runs up
            width:  { x: 1, y: 0, z: 0 },
            thick:  { x: 0, y: 0, z: 1 }
        };

        postPositions.forEach((pt, index) => {
            const yTop = height;
            const yNotch = height - beamDepth;
            const yBot = 0;

            const dx = (pt.x <= minX + 0.1) ? 1 : -1;
            const dz = (pt.z <= minZ + 0.1) ? 1 : -1;

            const xOut = pt.x;
            const xMid = pt.x + (beamThick * dx); 
            const xIn  = pt.x + (thick * dx);

            const zOut = pt.z;
            const zMid = pt.z + (beamThick  * dz);
            const zIn  = pt.z + (thick * dz);

            // --- PART 1: THE SQUARE BASE ---
            const baseCorners = [
                { x: xIn,  z: zIn  }, { x: xOut, z: zIn  },
                { x: xOut, z: zOut }, { x: xIn,  z: zOut }
            ];
            const baseVertices = [];
            baseCorners.forEach(c => {
                baseVertices.push({ x: c.x, y: yNotch, z: c.z });
                baseVertices.push({ x: c.x, y: yBot,   z: c.z });
            });
            
            const baseBoard = new Board(`post_${index}_base`, baseVertices);
            baseBoard.userData = {
                memberType: 'Post Base',
                trueWidth: thick,
                trueThick: thick,
                basis: postBasis,
                sourceVertices: baseVertices
            };
            boards.push(baseBoard);

            // --- PART 2: THE PILLAR (Top section) ---
            let pillarCorners = [];
            if (pt.isIntermediate) {
                const isXWall = Math.abs(pt.nextPt.x - pt.x) > Math.abs(pt.nextPt.z - pt.z);
                if (isXWall) {
                    pillarCorners = [
                        { x: xIn, z: zIn }, { x: xOut, z: zIn },
                        { x: xOut, z: zMid }, { x: xIn, z: zMid }
                    ];
                } else {
                    pillarCorners = [
                        { x: xIn, z: zIn }, { x: xMid, z: zIn },
                        { x: xMid, z: zOut }, { x: xIn, z: zOut }
                    ];
                }
            } else {
                pillarCorners = [
                    { x: xIn,  z: zIn  }, { x: xMid, z: zIn  },
                    { x: xMid, z: zMid }, { x: xIn,  z: zMid }
                ];
            }

            const pillarVertices = [];
            pillarCorners.forEach(c => {
                pillarVertices.push({ x: c.x, y: yTop,   z: c.z });
                pillarVertices.push({ x: c.x, y: yNotch, z: c.z });
            });

            const pillarBoard = new Board(`post_${index}_pillar`, pillarVertices);
            pillarBoard.userData = {
                memberType: 'Post Pillar',
                trueWidth: thick,
                trueThick: thick,
                basis: postBasis,
                sourceVertices: pillarVertices
            };
            boards.push(pillarBoard);
        });

        return { 
            boards,
            postCount: postPositions.length,
            appliedMaxSpan: maxSpan,
            sheathingData: {
                enabled: sheathingEnabled,
                area: postPositions.length * (thick * 4 * height) / 144
            }
        };
    }
}