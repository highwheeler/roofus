import * as THREE from 'three';

/**
 * HIP MODULE - Plain JS Version
 * [2026-02-27] Always generates whole files.
 * FIXED: Bottom miter removed; bottom is square to the vertical faces.
 * FIXED: Top face backing and end miters preserved.
 * ADDED: backingAngle calculation for BOMVisualizer callouts.
 */
export class HipModule {
    static create(oPts, r1, r2, config) {
        const boards = [];
        const debugLines = [];
        
        oPts.forEach((corner, i) => {
            const dist1 = Math.hypot(corner.x - r1.x, corner.z - r1.z);
            const dist2 = Math.hypot(corner.x - r2.x, corner.z - r2.z);
            const target = dist1 < dist2 ? r1 : r2;

            const prev = oPts[(i + oPts.length - 1) % oPts.length];
            const projectToEave = (pStart, pEnd, pRidge) => {
                const dx = pEnd.x - pStart.x;
                const dz = pEnd.z - pStart.z;
                const lenSq = dx * dx + dz * dz;
                const t = ((pRidge.x - pStart.x) * dx + (pRidge.z - pStart.z) * dz) / lenSq;
                return { x: pStart.x + t * dx, y: pStart.y, z: pStart.z + t * dz };
            };
            const perpPoint = projectToEave(prev, corner, target);
            debugLines.push({ start: { ...target }, end: { ...perpPoint }, color: 0x00ffff });

            boards.push(this.buildHipHalf(corner, target, config, -1, i));
            boards.push(this.buildHipHalf(corner, target, config, 1, i));
        });

        return { boards, debugLines };
    }

    static buildHipHalf(pTail, pPeak, config, sideDir, index) {
        const { thick, rafterDepth: depth, slope } = config;

        const dx = pTail.x - pPeak.x;
        const dz = pTail.z - pPeak.z;
        const totalHipRun = Math.hypot(dx, dz);
        
        const hDir = { x: dx / totalHipRun, z: dz / totalHipRun };
        const hSide = { x: -hDir.z, z: hDir.x };

        const hipSlope = slope ; //* 0.70710678; 
        const vAngleHip = Math.atan(hipSlope);
        const vDepth = depth / Math.cos(vAngleHip);

        /**
         * getV - Geometric Height Projection
         * topY: Calculated with offsets to maintain roof plane backing.
         * botY: Calculated based on the ridge-path only to keep the bottom square.
         */
        const getV = (anchor, sOff, lOff) => {
            const px = anchor.x + (hSide.x * sOff * sideDir) + (hDir.x * lOff);
            const pz = anchor.z + (hSide.z * sOff * sideDir) + (hDir.z * lOff);
            
            const vx = px - pPeak.x;
            const vz = pz - pPeak.z;
            const commonRun = Math.max(Math.abs(vx), Math.abs(vz));
            const topY = pPeak.y - (commonRun * slope);

            // Use centerline height for bottom to ensure squareness
            const cpx = anchor.x + (hDir.x * lOff);
            const cpz = anchor.z + (hDir.z * lOff);
            const cvx = cpx - pPeak.x;
            const cvz = cpz - pPeak.z;
            const centerRun = Math.max(Math.abs(cvx), Math.abs(cvz));
            const centerTopY = pPeak.y - (centerRun * slope);
            const botY = centerTopY - vDepth;

            return [
                { x: px, y: topY, z: pz },    
                { x: px, y: botY, z: pz }     
            ];
        };

        const [t0, b0] = getV(pPeak, 0, 0);               
        const [t1, b1] = getV(pPeak, thick, thick);       
        const [t2, b2] = getV(pTail, thick, -thick);      
        const [t3, b3] = getV(pTail, 0, 0);               

        const verts = [t0, b0, t1, b1, t2, b2, t3, b3];

        // Backing Angle calculation (for the BOM callout)
        // This is the angle of the miter on the top face relative to square.
        const rise = Math.abs(t0.y - t1.y);
        const run = thick;
        const backingAngleDeg = (Math.atan(rise / run) * 180) / Math.PI;

        const vLength = new THREE.Vector3(hDir.x, -hipSlope, hDir.z).normalize();
        const vThick = new THREE.Vector3(hSide.x * sideDir, 0, hSide.z * sideDir).normalize();
        const vWidth = new THREE.Vector3().crossVectors(vLength, vThick).normalize();

        const boardLength = Math.hypot(totalHipRun, totalHipRun * hipSlope);

        return { 
            id: `hip_${index}_${sideDir}`, 
            userData: {
                memberType: 'hip_rafter',
                trueLength: boardLength,
                trueWidth: depth,
                trueThick: thick,
                backingAngle: backingAngleDeg, // Callout this in the BOM Visualizer
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