import * as THREE from 'three';

export class BOMReport {
    static getTrueDimensions(node) {
        const ud = node.userData;
        if (!ud || !ud.sourceVertices || !ud.basis) {
            return { length: 0, width: 0, thick: 0, formatted: { l: '0"', w: '0"', t: '0"' } };
        }

        // 1. Retrieve the pre-calculated basis from FieldModule
        const b = ud.basis;
        const axisL = new THREE.Vector3(b.length.x, b.length.y, b.length.z);
        const axisW = new THREE.Vector3(b.width.x, b.width.y, b.width.z);
        const axisT = new THREE.Vector3(b.thick.x, b.thick.y, b.thick.z);

        // 2. Project stored vertices to find absolute spans
        let minL = Infinity, maxL = -Infinity;
        
        ud.sourceVertices.forEach(v => {
            const p = new THREE.Vector3(v.x, v.y, v.z);
            const l = p.dot(axisL);
            minL = Math.min(minL, l);
            maxL = Math.max(maxL, l);
        });

        // 3. Use Guard-railed dimensions from userData
        const dims = {
            length: maxL - minL,
            width: ud.trueWidth || 0,
            thick: ud.trueThick || 0
        };

        return {
            ...dims,
            formatted: {
                l: this.formatInches(dims.length),
                w: this.formatInches(dims.width),
                t: this.formatInches(dims.thick)
            },
            basis: { length: axisL, width: axisW, thick: axisT },
            sourceVertices: ud.sourceVertices
        };
    }

    static formatInches(decimal) {
        const totalSixteenths = Math.round(decimal * 16);
        if (totalSixteenths === 0) return '0"';
        const inches = Math.floor(totalSixteenths / 16);
        const sixteenths = totalSixteenths % 16;
        if (sixteenths === 0) return `${inches}"`;
        let n = sixteenths, d = 16;
        while (n % 2 === 0 && d % 2 === 0) { n /= 2; d /= 2; }
        return inches === 0 ? `${n}/${d}"` : `${inches} ${n}/${d}"`;
    }

    static generate(roofGroup) {
        const report = { groups: {} };
        roofGroup.traverse(node => {
            if (!node.isMesh || !node.userData.memberType) return;
            const data = this.getTrueDimensions(node);
            const type = node.userData.memberType;
            
            // Signature for grouping identical boards
            const sig = `${type}-${data.formatted.l}-${data.formatted.w}-${data.formatted.t}`;

            if (!report.groups[type]) report.groups[type] = [];
            const existing = report.groups[type].find(p => p.signature === sig);
            if (existing) {
                existing.quantity++;
            } else {
                report.groups[type].push({ 
                    ...data, 
                    quantity: 1, 
                    signature: sig 
                });
            }
        });
        return report;
    }
}