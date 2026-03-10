import * as THREE from 'three';

/**
 * GEOMETRY MODULE v2.0
 * Calculates the roof skeleton: Ridge, Eaves, and Hip base points.
 */
export class GeometryModule {
    static calculate(pts, slope, overhang) {
         console.log(pts);
        if (!pts || pts.length < 3) return null;

        // 1. Generate Outer Points (oPts) with Overhang
        // This expands the footprint by the overhang distance
        const oPts = this.offsetPoints(pts, overhang);

        // 2. Determine Building Bounds
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        oPts.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
        });

        const width = maxX - minX;
        const depth = maxZ - minZ;
        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;

        // 3. Calculate Ridge Length
        // On a standard hip roof, the ridge length = (Long Side - Short Side)
        const isWide = width > depth;
        const shortSide = isWide ? depth : width;
        const longSide = isWide ? width : depth;
        const ridgeLen = Math.max(0, longSide - shortSide);
        
        // 4. Set Ridge Points at the calculated Height
        // Height = (ShortSide / 2) * slope
        const height = (shortSide / 2) * slope;
        const wallTopY = pts[0].y;
        const ridgeY = wallTopY + height;

        let r1, r2;
        if (isWide) {
            r1 = new THREE.Vector3(centerX - ridgeLen / 2, ridgeY, centerZ);
            r2 = new THREE.Vector3(centerX + ridgeLen / 2, ridgeY, centerZ);
        } else {
            r1 = new THREE.Vector3(centerX, ridgeY, centerZ - ridgeLen / 2);
            r2 = new THREE.Vector3(centerX, ridgeY, centerZ + ridgeLen / 2);
        }

        return {
            oPts: oPts,
            r1: r1,
            r2: r2,
            height: height,
            center: new THREE.Vector3(centerX, wallTopY, centerZ)
        };
    }

    /**
     * Offsets a polygon outward (overhang)
     */
    static offsetPoints(pts, amount) {
        const result = [];
        const len = pts.length;

        for (let i = 0; i < len; i++) {
            const prev = pts[(i + len - 1) % len];
            const curr = pts[i];
            const next = pts[(i + 1) % len];

            // Edge directions
            const v1 = new THREE.Vector3().subVectors(curr, prev).setY(0).normalize();
            const v2 = new THREE.Vector3().subVectors(next, curr).setY(0).normalize();

            // Normals
            const n1 = new THREE.Vector3(-v1.z, 0, v1.x);
            const n2 = new THREE.Vector3(-v2.z, 0, v2.x);

            // Bisector for the corner
            const bisector = new THREE.Vector3().addVectors(n1, n2).normalize();
            
            // Calculate distance to corner to maintain 'amount' thickness at edges
            const cosTheta = bisector.dot(n1);
            const dist = amount / cosTheta;

            result.push(curr.clone().addScaledVector(bisector, dist));
        }

        return result;
    }
}