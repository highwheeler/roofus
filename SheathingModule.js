import * as THREE from 'three';

/**
 * SHEATHING MODULE v19.7 - Metadata Enhanced
 * [2026-02-24] Always generates whole files.
 * MANDATORY: All seams occur at (n * rafterSpacing).
 * UPDATED: [2026-02-26] Added sourceVertices and basis to userData for BOM accuracy.
 */
export class SheathingModule {
    static create(oPts, r1, r2, config) {
        const debugLines = [];
        const boards = [];
        const { slope, wallRun, overhang, rafterSpacing, sheathingThickness: thick = 0.5 } = config;

        const vAngle = Math.atan(slope);
        const cosA = Math.cos(vAngle);
        const sinA = Math.sin(vAngle);
        const totalRun = wallRun + overhang;
        const slopeLen = totalRun / cosA;
        const gap = 0; // Standard gap 0 for calculations

        const getNormal = (uDir) => ({
            x: -uDir.x * sinA,
            y: cosA,
            z: -uDir.z * sinA
        });

        const clipPoly = (poly, a, b, c) => {
            const out = [];
            for (let i = 0; i < poly.length; i++) {
                const curr = poly[i];
                const prev = poly[(i + poly.length - 1) % poly.length];
                const dCurr = a * curr.x + b * curr.y + c;
                const dPrev = a * prev.x + b * prev.y + c;
                if (dCurr >= 0) {
                    if (dPrev < 0) {
                        const t = dPrev / (dPrev - dCurr);
                        out.push({ x: prev.x + t * (curr.x - prev.x), y: prev.y + t * (curr.y - prev.y) });
                    }
                    out.push(curr);
                } else if (dPrev >= 0) {
                    const t = dPrev / (dPrev - dCurr);
                    out.push({ x: prev.x + t * (curr.x - prev.x), y: prev.y + t * (curr.y - prev.y) });
                }
            }
            return out;
        };

        for (let i = 0; i < oPts.length; i++) {
            const p1 = oPts[i];
            const p2 = oPts[(i + 1) % oPts.length];
            const eaveVec = { x: p2.x - p1.x, z: p2.z - p1.z };
            const eaveLen = Math.hypot(eaveVec.x, eaveVec.z);
            const eaveDir = { x: eaveVec.x / eaveLen, z: eaveVec.z / eaveLen };

            let upDirH = { x: -eaveDir.z, z: eaveDir.x };
            const center = { x: (r1.x + r2.x) / 2, z: (r1.z + r2.z) / 2 };
            if (upDirH.x * (center.x - p1.x) + upDirH.z * (center.z - p1.z) < 0) {
                upDirH.x *= -1; upDirH.z *= -1;
            }

            const norm = getNormal(upDirH);
            const numRows = Math.ceil(slopeLen / 48);
            const midX = eaveLen / 2;

            // --- BASIS LOGIC FOR BOM ---
            // Length: Along the eave
            const vLength = new THREE.Vector3(eaveDir.x, 0, eaveDir.z).normalize();
            // Width: Up the slope
            const vWidth = new THREE.Vector3(upDirH.x * cosA, sinA, upDirH.z * cosA).normalize();
            // Thickness: The surface normal
            const vThick = new THREE.Vector3(norm.x, norm.y, norm.z).normalize();

            const project = (lx, ly, isTop) => {
                const h = ly * cosA;
                const v = ly * sinA;
                const offset = isTop ? thick : 0;
                return {
                    x: p1.x + (eaveDir.x * lx) + (upDirH.x * h) + (norm.x * offset),
                    y: p1.y + v + (norm.y * offset),
                    z: p1.z + (eaveDir.z * lx) + (upDirH.z * h) + (norm.z * offset)
                };
            };

            for (let row = 0; row < numRows; row++) {
                const yS = (row * 48) + (gap / 2);
                const yE = Math.min((row + 1) * 48, slopeLen) - (gap / 2);
                const rowStagger = (row % 2 === 1) ? 2 : 0;

                let rowPoly = [
                    { x: 0, y: yS }, { x: eaveLen, y: yS },
                    { x: eaveLen, y: yE }, { x: 0, y: yE }
                ];

                rowPoly = clipPoly(rowPoly, 1, -cosA, -(gap / 2)); 
                rowPoly = clipPoly(rowPoly, -1, -cosA, eaveLen - (gap / 2)); 

                if (rowPoly.length < 3) continue;

                const minRowX = Math.min(...rowPoly.map(p => p.x));
                const maxRowX = Math.max(...rowPoly.map(p => p.x));

                const potentialSeams = [];
                for (let r = -50; r <= 50; r++) {
                    const seamX = midX + ((r + rowStagger) * rafterSpacing);
                    if (seamX > minRowX + 0.01 && seamX < maxRowX - 0.01) {
                        potentialSeams.push(seamX);
                    }
                }
                const allNodes = [minRowX, ...potentialSeams, maxRowX].sort((a, b) => a - b);

                const finalSeams = [allNodes[0]];
                let lastX = allNodes[0];

                for (let j = 1; j < allNodes.length; j++) {
                    const currentX = allNodes[j];
                    const nextX = allNodes[j+1];
                    const distFromLast = currentX - lastX;
                    const willExceed = nextX ? (nextX - lastX > 96.01) : true;
                    
                    if (willExceed || distFromLast >= 95.9) {
                        finalSeams.push(currentX);
                        lastX = currentX;
                    }
                }

                for (let j = 0; j < finalSeams.length - 1; j++) {
                    const bS = finalSeams[j] + (j === 0 ? 0 : gap/2);
                    const bE = finalSeams[j+1] - (j === finalSeams.length - 2 ? 0 : gap/2);

                    let piecePoly = [...rowPoly];
                    piecePoly = clipPoly(piecePoly, 1, 0, -bS); 
                    piecePoly = clipPoly(piecePoly, -1, 0, bE); 

                    if (piecePoly.length < 3) continue;

                    const verts = [];
                    piecePoly.forEach(p => {
                        verts.push(project(p.x, p.y, true));  
                        verts.push(project(p.x, p.y, false)); 
                    });

                    const boardLength = bE - bS;
                    const boardWidth = yE - yS;

                    boards.push({
                        id: `sh_${i}_${row}_${j}`,
                        memberType: 'sheathing',
                        length: boardLength,
                        width: boardWidth,
                        thick: thick,
                        userData: {
                            memberType: 'sheathing',
                            trueLength: boardLength,
                            trueWidth: boardWidth,
                            trueThick: thick,
                            sourceVertices: verts,
                            basis: {
                                length: vLength,
                                width: vWidth,
                                thick: vThick
                            }
                        },
                        vertices: verts
                    });
                }
            }
        }
        return { boards, debugLines };
    }
}