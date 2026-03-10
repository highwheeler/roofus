/**
 * BOARD CLASS - Solid Prism Logic
 * [2026-02-22] Always generates whole files.
 * FIXED: Strictly ordered fan triangulation to prevent self-overlap ghosting.
 */
export class Board {
    constructor(id, vertices) {
        this.id = id;
        this.vertices = vertices; // Expected: [T0, B0, T1, B1, ...]
    }

    getGeometryData() {
        const d = this.vertices;
        const cornerCount = d.length / 2;
        if (cornerCount < 3) return new Float32Array(0);

        const tris = [];
        const pushV = (v) => tris.push(v.x, v.y, v.z);

        // 1. TOP CAP (Counter-Clockwise)
        for (let i = 1; i < cornerCount - 1; i++) {
            pushV(d[0]); 
            pushV(d[i * 2]); 
            pushV(d[(i + 1) * 2]);
        }

        // 2. BOTTOM CAP (Clockwise)
        for (let i = 1; i < cornerCount - 1; i++) {
            pushV(d[1]); 
            pushV(d[(i + 1) * 2 + 1]);
            pushV(d[i * 2 + 1]); 
        }

        // 3. SIDE WALLS (Quads)
        for (let i = 0; i < cornerCount; i++) {
            const currT = i * 2;
            const currB = i * 2 + 1;
            const nextT = ((i + 1) % cornerCount) * 2;
            const nextB = ((i + 1) % cornerCount) * 2 + 1;

            // Tri 1
            pushV(d[currT]); pushV(d[nextT]); pushV(d[currB]);
            // Tri 2
            pushV(d[nextT]); pushV(d[nextB]); pushV(d[currB]);
        }

        return new Float32Array(tris);
    }
}