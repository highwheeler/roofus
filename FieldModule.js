import * as THREE from 'three';

/**
 * FIELD MODULE - Structural Edition
 * [2026-03-01] Always generates whole files.
 * FIXED: Precise geometric calculation for Jack-to-Hip intersection.
 * CALCULATED: Uses (thick * 0.914) offset to align Jack cheek-cut short point 
 * with the outer face of the offset Hip assembly.
 */
export class FieldModule {
    static create(oPts, r1, r2, config) {
        // --- CONSTANTS ---
        const MIN_RAFTER_LENGTH = 8.0; 

        // --- WINDING CORRECTION ---
        let area = 0;
        for (let i = 0; i < oPts.length; i++) {
            const j = (i + 1) % oPts.length;
            area += oPts[i].x * oPts[j].z;
            area -= oPts[j].x * oPts[i].z;
        }
        const localPts = (area < 0) ? [...oPts].reverse() : oPts;

        let boards = [];
        const { 
            rafterSpacing, 
            wallRun, 
            overhang, 
            slope, 
            rafterDepth, 
            thick
        } = config;

        const ridgeVec = { x: r2.x - r1.x, z: r2.z - r1.z };
        const ridgeLen = Math.hypot(ridgeVec.x, ridgeVec.z);
        const isPyramid = ridgeLen < 0.1;

        const vAngle = Math.atan(slope);
        const vDepth = rafterDepth / Math.cos(vAngle);
        const spacing = parseFloat(rafterSpacing);
        const totalRun = wallRun + overhang;

        const ridgeIsX = Math.abs(ridgeVec.x) >= Math.abs(ridgeVec.z);
        const center = { x: (r1.x + r2.x) / 2, y: r1.y, z: (r1.z + r2.z) / 2 };

        const ridgeDir = ridgeIsX ? { x: 1, z: 0 } : { x: 0, z: 1 };
        const runDir = ridgeIsX ? { x: 0, z: 1 } : { x: 1, z: 0 };

        const halfRidgeLen = ridgeLen / 2;
        const halfBuildingLength = halfRidgeLen + wallRun + overhang;
        const numSpacesSide = Math.floor(halfBuildingLength / spacing);

        // --- SECTION A: MAIN SIDES ---
        for (let i = -numSpacesSide; i <= numSpacesSide; i++) {
            const distFromCenter = i * spacing;
            const absDist = Math.abs(distFromCenter);

            if (isPyramid && Math.abs(i) < 0.1) continue;

            const anchor = {
                x: center.x + ridgeDir.x * distFromCenter,
                y: center.y,
                z: center.z + ridgeDir.z * distFromCenter
            };

            const distPastRidge = Math.max(0, absDist - halfRidgeLen);
            const isJack = distPastRidge > 0.01 || isPyramid; 
            
            /**
             * THE "NO SINK" FORMULA:
             * For a 45-deg hip that is two-members wide:
             * 1. The Hip outer face is (thick * 1.414) away from ridge center in the Jack's path.
             * 2. The Jack's short point is (thick / 2) behind its centerline.
             * 3. Result: Offset = (thick * 1.414) - (thick * 0.5) = thick * 0.914.
             */
            const hipFaceOffset = isJack ? (thick * 0.9142) : (thick);
            const headOffset = distPastRidge + hipFaceOffset;

            const horizontalRun = totalRun - headOffset;
            if (horizontalRun > MIN_RAFTER_LENGTH) {
                boards.push(this.buildFieldBoard(anchor, runDir, totalRun, headOffset, config, vDepth, 1, isJack, center, `side_p_${i}`));
                boards.push(this.buildFieldBoard(anchor, runDir, totalRun, headOffset, config, vDepth, -1, isJack, center, `side_n_${i}`));
            }
        }

        // --- SECTION B: END CAPS ---
        [r1, r2].forEach((tip, tipIdx) => {
            const endSign = (tipIdx === 0) ? -1 : 1;
            const numSpacesEnd = Math.floor((wallRun + overhang) / spacing);
            for (let j = -numSpacesEnd; j <= numSpacesEnd; j++) {
                const marchDist = j * spacing;
                const absMarch = Math.abs(marchDist);

                if (absMarch < 0.1 ) continue; 

                const anchor = {
                    x: tip.x + (ridgeIsX ? 0 : marchDist),
                    y: tip.y,
                    z: tip.z + (ridgeIsX ? marchDist : 0)
                };

                const headOffset = absMarch + (thick * 0.9142);
                
                const horizontalRun = totalRun - headOffset;
                if (horizontalRun > MIN_RAFTER_LENGTH) {
                    const endRunDir = ridgeIsX ? { x: 1, z: 0 } : { x: 0, z: 1 };
                    boards.push(this.buildFieldBoard(anchor, endRunDir, totalRun, headOffset, config, vDepth, endSign, true, center, `end_${tipIdx}_${j}`));
                }
            }
        });

        return { boards };
    }

    static buildFieldBoard(anchor, dir, run, headOffset, config, vDepth, sideDir, isJack, ridgeCenter, id) {
        const { thick, slope, rafterDepth } = config;
        const hSide = { x: -dir.z, z: dir.x };
        const halfThick = thick / 2;

        const getPt = (rDist, sOff) => ({
            x: anchor.x + (dir.x * rDist * sideDir) + (hSide.x * sOff),
            y: anchor.y - (rDist * slope),
            z: anchor.z + (dir.z * rDist * sideDir) + (hSide.z * sOff)
        });

        let rL = headOffset;
        let rR = headOffset;

        if (isJack) {
            const miter = thick; 
            const testSidePt = { x: anchor.x + hSide.x * 10, z: anchor.z + hSide.z * 10 };
            const distAnchor = Math.hypot(anchor.x - ridgeCenter.x, anchor.z - ridgeCenter.z);
            const distSide = Math.hypot(testSidePt.x - ridgeCenter.x, testSidePt.z - ridgeCenter.z);

            if (distSide < distAnchor) {
                rL = headOffset + miter;
                rR = headOffset;
            } else {
                rL = headOffset;
                rR = headOffset + miter;
            }
        }

        const tFL = getPt(rL, -halfThick); 
        const tFR = getPt(rR,  halfThick);  
        const tBR = getPt(run, halfThick);  
        const tBL = getPt(run, -halfThick); 

        const verts = [
            tFL, { x: tFL.x, y: tFL.y - vDepth, z: tFL.z }, 
            tFR, { x: tFR.x, y: tFR.y - vDepth, z: tFR.z }, 
            tBR, { x: tBR.x, y: tBR.y - vDepth, z: tBR.z }, 
            tBL, { x: tBL.x, y: tBL.y - vDepth, z: tBL.z }   
        ];

        const horizontalRun = run - ((rL + rR) / 2);
        const boardLength = Math.sqrt(Math.pow(horizontalRun, 2) + Math.pow(horizontalRun * slope, 2));

        const vLength = new THREE.Vector3(dir.x * sideDir, -slope, dir.z * sideDir).normalize();
        const vThick = new THREE.Vector3(hSide.x, 0, hSide.z).normalize();
        const vWidth = new THREE.Vector3().crossVectors(vLength, vThick).normalize();

        return {
            id,
            userData: {
                memberType: isJack ? 'jack_rafter' : 'common_rafter',
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