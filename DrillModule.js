import * as THREE from 'three';

/**
 * DRILL MODULE v1.4
 * [2026-03-10] Always generates whole files.
 * UPDATED: Extended drill length to 48" to ensure visibility outside of beams and posts.
 * ORIENTATION: Long Axis (Length).
 */
export class DrillModule {
    /**
     * Creates a drill hole through the center of a knee brace.
     * @param {Object} brace - The knee brace board object.
     * @param {Object} config - Contains drillDiameter.
     */
    static createKneeBraceHole(brace, config = {}) {
        const diameter = config.drillDiameter || 0.625;
        const verts = brace.vertices || (brace.userData && brace.userData.sourceVertices);
        
        if (!verts || verts.length < 8) return null;

        // 1. Calculate Centroid (Geometric Center)
        const center = verts.reduce((acc, v) => {
            acc.x += v.x / 8;
            acc.y += v.y / 8;
            acc.z += v.z / 8;
            return acc;
        }, { x: 0, y: 0, z: 0 });

        // 2. Orientation: Long Axis (Length)
        const drillDir = brace.userData.basis.length;

        // 3. Depth: Increased to 48" to guarantee it protrudes 
        // past the 6x6 post and the beam depth.
        const totalDepth = 48; 

        return {
            id: `drill_${brace.id}`,
            position: center,
            direction: drillDir,
            diameter: diameter,
            length: totalDepth,
            userData: {
                memberType: 'DrillHole',
                parentMember: brace.id
            }
        };
    }

    /**
     * Generates a 3D Cylinder for visualization.
     */
    static getVisualMesh(drillData) {
        // Use a slightly larger segments count (16) for a smoother cylinder at this length
        const geometry = new THREE.CylinderGeometry(
            drillData.diameter / 2, 
            drillData.diameter / 2, 
            drillData.length, 
            16
        );
        
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            wireframe: true,
            transparent: true,
            opacity: 0.9 // Increased opacity for better visibility against dark lumber
        });
        
        const mesh = new THREE.Mesh(geometry, material);

        // Position the center of the cylinder at the centroid of the brace
        mesh.position.set(drillData.position.x, drillData.position.y, drillData.position.z);

        // Align the Cylinder Y-axis (default) to the longitudinal length vector
        const targetVec = new THREE.Vector3(drillData.direction.x, drillData.direction.y, drillData.direction.z).normalize();
        const upVec = new THREE.Vector3(0, 1, 0);
        
        mesh.quaternion.setFromUnitVectors(upVec, targetVec);

        return mesh;
    }
}