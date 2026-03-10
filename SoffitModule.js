export class SoffitModule {
    static create(wallPts, oPts, config) {
        const boards = [];
        wallPts.forEach((pW1, i) => {
            const pW2 = wallPts[(i + 1) % wallPts.length];
            const pO1 = oPts[i];
            const pO2 = oPts[(i + 1) % oPts.length];
            
            // A flat panel between wall and overhang
            const verts = [
                {x: pO1.x, y: pO1.y, z: pO1.z}, {x: pO1.x, y: pO1.y-0.2, z: pO1.z},
                {x: pO2.x, y: pO2.y, z: pO2.z}, {x: pO2.x, y: pO2.y-0.2, z: pO2.z},
                {x: pW2.x, y: pO2.y, z: pW2.z}, {x: pW2.x, y: pO2.y-0.2, z: pW2.z},
                {x: pW1.x, y: pO1.y, z: pW1.z}, {x: pW1.x, y: pO1.y-0.2, z: pW1.z}
            ];
            boards.push({ id: `soffit_${i}`, vertices: verts });
        });
        return { boards };
    }
}