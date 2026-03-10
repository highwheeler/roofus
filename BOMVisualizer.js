import * as THREE from 'three';
import { BOMReport } from './BOMReport.js';

/**
 * BOM VISUALIZER - Fabrication Standard v8.2
 * [2026-03-05] FIXED: Pricing values by aligning with BOMReport numerical output.
 * [2026-03-05] CALCULATED: Pricing based on nearest 2' stock length (min 8ft) @ $1.15/BF.
 */
export class BOMVisualizer {
    constructor(container, roofGroup) {
        this.container = container;
        this.roofGroup = roofGroup;
        this.isOpen = false;
        this.overlay = this.createOverlay();
        // Pricing Constants
        this.PRICE_PER_BF = 1.15; 
    }

    createOverlay() {
        const div = document.createElement('div');
        div.id = "bom-overlay";
        div.style = `position:absolute; top:0; right:0; width:1400px; height:100%; background:#fff; border-left:6px solid #111; padding:40px; overflow-y:auto; display:none; z-index:9999; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;`;
        
        const close = document.createElement('button');
        close.innerText = '[ CLOSE SHOP DRAWINGS ]';
        close.style = "position:sticky; top:0; float:right; background:#111; color:#fff; padding:15px 25px; font-weight:900; cursor:pointer; border:none; z-index:10000; letter-spacing: 1px;";
        close.onclick = () => this.toggle();
        
        div.appendChild(close);
        this.container.appendChild(div);
        return div;
    }

    toggle() {
        this.isOpen = !this.isOpen;
        this.overlay.style.display = this.isOpen ? 'block' : 'none';
        if (this.isOpen) this.refresh();
    }

    refresh() {
        const report = BOMReport.generate(this.roofGroup);
        const btn = this.overlay.querySelector('button');
        this.overlay.innerHTML = '';
        this.overlay.appendChild(btn);

        // --- COST SUMMARY HEADER ---
        let totalProjectCost = 0;
        let totalBoardFeet = 0;

        if (report && report.groups) {
            Object.values(report.groups).forEach(parts => {
                parts.forEach(part => {
                    const costData = this.calculatePartCost(part);
                    totalProjectCost += costData.totalCost;
                    totalBoardFeet += costData.totalBF;
                });
            });
        }

        const summary = document.createElement('div');
        summary.style = "background:#f0f0f0; border:4px solid #111; padding:30px; margin-bottom:40px; display:flex; justify-content:space-between; align-items:center;";
        summary.innerHTML = `
            <div>
                <h1 style="margin:0; letter-spacing:2px;">PROJECT ESTIMATE</h1>
                <p style="margin:5px 0 0 0; color:#666;">Rates: $${this.PRICE_PER_BF.toFixed(2)}/BF | Stock: 2' Increments</p>
            </div>
            <div style="text-align:right;">
                <div style="font-size:14px; color:#666;">TOTAL VOLUME: ${totalBoardFeet.toFixed(2)} BF</div>
                <div style="font-size:42px; font-weight:900; color:#1b5e20;">$${totalProjectCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
        `;
        this.overlay.appendChild(summary);

        for (const [type, parts] of Object.entries(report.groups)) {
            const h2 = document.createElement('h2');
            h2.innerText = type.toUpperCase();
            h2.style = "background:#222; color:#fff; padding:12px 20px; margin-top:40px; border-radius: 4px; letter-spacing: 2px;";
            this.overlay.appendChild(h2);

            parts.forEach(part => {
                const card = this.createCard(part);
                this.overlay.appendChild(card);
                this.renderViews(card, part);
            });
        }
    }

    calculatePartCost(part) {
        // Dimensions directly from BOMReport data
        const L = part.length || 0;
        const W = part.width || 0;
        const T = part.thick || 0;

        // Determine nominal stock length (Minimum 8ft, increments of 2ft)
        const actualFeet = L / 12;
        const stockFeet = L > 0 ? Math.max(8, Math.ceil(actualFeet / 2) * 2) : 0;
        
        // Board Foot Calculation: (T" * W" * L_stock') / 12
        const bfPerPiece = (T * W * stockFeet) / 12;
        const totalBF = bfPerPiece * (part.quantity || 0);
        const totalCost = totalBF * this.PRICE_PER_BF;

        return { 
            stockFeet: isNaN(stockFeet) ? 0 : stockFeet, 
            totalCost: isNaN(totalCost) ? 0 : totalCost, 
            totalBF: isNaN(totalBF) ? 0 : totalBF 
        };
    }

    createCard(part) {
        const div = document.createElement('div');
        div.style = "margin-bottom:60px; border:2px solid #ddd; background:#fff; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-radius: 6px; overflow: hidden;";
        
        const labelStyle = "position:absolute; top:0; left:0; background:#111; color:#fff; padding:8px 12px; font-weight:bold; font-size:14px; letter-spacing:1px; z-index:10;";
        const costData = this.calculatePartCost(part);

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items: center; background:#fff; padding:20px 30px; border-bottom:2px solid #111;">
                <div>
                    <div style="font-size:24px;"><b>ID:</b> ${part.signature ? part.signature.split('-')[0] : 'UNKNOWN'}</div>
                    <div style="font-size:12px; color:#888; margin-top:4px;">STOCK REQ: ${costData.stockFeet}' Length</div>
                </div>
                <div style="text-align:center;">
                    <div style="color:#d32f2f; font-size:28px; font-weight:900;">QTY: ${part.quantity || 0}</div>
                    <div style="font-size:14px; font-weight:bold; color:#1b5e20;">Est: $${costData.totalCost.toFixed(2)}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:22px; font-weight:bold; color:#555;">${part.formatted ? (part.formatted.t + ' x ' + part.formatted.w + ' x ' + part.formatted.l) : 'N/A'}</div>
                    <div style="font-size:12px; color:#888;">${costData.totalBF.toFixed(2)} Total BF</div>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr 400px; grid-template-rows: 400px; gap:15px; padding:15px; background: #f9f9f9;">
                <div class="panel" data-view="side" style="background:#fff; border:1px solid #ccc; position:relative;">
                    <div style="${labelStyle}">SIDE ELEVATION</div>
                </div>
                <div class="panel" data-view="top" style="background:#fff; border:1px solid #ccc; position:relative;">
                    <div style="${labelStyle}">TOP PLAN</div>
                </div>
                <div class="panel" data-view="profile" style="background:#fff; border:1px solid #ccc; position:relative;">
                    <div style="${labelStyle}">END PROFILE</div>
                </div>
            </div>
        `;
        return div;
    }

    renderViews(card, part) {
        if (!part.basis || !part.sourceVertices) return;
        const panels = card.querySelectorAll('.panel');
        const verts = part.sourceVertices;
        const b = part.basis;

        panels.forEach(panel => {
            const view = panel.dataset.view;
            let axisX, axisY, dimLabelX, dimLabelY;
            
            if (view === 'side') { axisX = b.length; axisY = b.width; dimLabelX = part.formatted.l; }
            else if (view === 'top') { axisX = b.length; axisY = b.thick; dimLabelX = part.formatted.l; }
            else if (view === 'profile') { 
                axisX = b.thick; 
                axisY = b.width; 
                dimLabelX = part.formatted.t; 
                dimLabelY = part.formatted.w;
            }

            const points2D = verts.map(v => ({
                x: new THREE.Vector3(v.x, v.y, v.z).dot(axisX.clone().normalize()),
                y: new THREE.Vector3(v.x, v.y, v.z).dot(axisY.clone().normalize())
            }));

            const hull = this.getHull(points2D);
            const angles = this.calculateAngles(hull);
            
            this.drawFabricationView(panel, hull, angles, view, dimLabelX, dimLabelY);
        });
    }

    getHull(pts) {
        pts.sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
        const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        const lower = [], upper = [];
        for (let p of pts) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
        }
        for (let i = pts.length - 1; i >= 0; i--) {
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
            upper.push(pts[i]);
        }
        upper.pop(); lower.pop();
        return lower.concat(upper);
    }

    calculateAngles(pts) {
        let angles = [];
        for (let i = 0; i < pts.length; i++) {
            let p = pts[i];
            let pPrev = pts[(i - 1 + pts.length) % pts.length];
            let pNext = pts[(i + 1) % pts.length];
            let v1 = { x: pPrev.x - p.x, y: pPrev.y - p.y };
            let v2 = { x: pNext.x - p.x, y: pNext.y - p.y };
            let dot = (v1.x * v2.x + v1.y * v2.y);
            let mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
            let angle = Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI;
            
            if (Math.abs(angle - 90) > 0.5 && Math.abs(angle - 180) > 0.5) {
                let dx = p.x - (pPrev.x + pNext.x) / 2;
                let dy = p.y - (pPrev.y + pNext.y) / 2;
                let len = Math.hypot(dx, dy) || 1;
                angles.push({ origX: p.x, origY: p.y, angle: angle, dirX: dx/len, dirY: dy/len });
            }
        }
        return angles;
    }

    clipPolygonX(poly, cutX, keepLeft) {
        let out = [];
        for (let i = 0; i < poly.length; i++) {
            let cur = poly[i];
            let prev = poly[(i - 1 + poly.length) % poly.length];
            let curIn = keepLeft ? cur.x <= cutX : cur.x >= cutX;
            let prevIn = keepLeft ? prev.x <= cutX : prev.x >= cutX;
            if (curIn !== prevIn) {
                let t = (cutX - prev.x) / (cur.x - prev.x);
                out.push({ x: cutX, y: prev.y + t * (cur.y - prev.y), isClip: true });
            }
            if (curIn) out.push(cur);
        }
        return out;
    }

    drawFabricationView(container, hull, angles, view, dimLabelX, dimLabelY) {
        if (!container) return;
        const minX = Math.min(...hull.map(p => p.x)), maxX = Math.max(...hull.map(p => p.x));
        const minY = Math.min(...hull.map(p => p.y)), maxY = Math.max(...hull.map(p => p.y));
        const realW = maxX - minX, realH = Math.max(0.1, maxY - minY);

        const SVG_W = 1200, SVG_H = 600;
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", `0 0 ${SVG_W} ${SVG_H}`);
        svg.style = "width:100%; height:100%; overflow:hidden; display:block;";

        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.innerHTML = `<pattern id="hatchAll" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="20" stroke="#eee" stroke-width="6" /></pattern>`;
        svg.appendChild(defs);

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        let mapFnX, mapFnY, shapeBottomY, shapeLeftX;

        if (view === 'profile') {
            const SCALE = (SVG_H * 0.55) / realH; 
            mapFnX = (origX) => SVG_W/2 + (origX - (minX + maxX)/2) * SCALE;
            mapFnY = (origY) => SVG_H/2 + (origY - (minY + maxY)/2) * SCALE;
            
            const mappedPoints = hull.map(p => ({ x: mapFnX(p.x), y: mapFnY(p.y) }));
            this.drawPath(g, mappedPoints, true, "url(#hatchAll)");
            
            const mMinX = Math.min(...mappedPoints.map(p=>p.x));
            const mMaxX = Math.max(...mappedPoints.map(p=>p.x));
            const mMinY = Math.min(...mappedPoints.map(p=>p.y));
            const mMaxY = Math.max(...mappedPoints.map(p=>p.y));

            shapeBottomY = mMaxY;
            shapeLeftX = mMinX;

            if (dimLabelX) this.addDimLine(svg, mMinX, SVG_H - 80, mMaxX, SVG_H - 80, dimLabelX, shapeBottomY);
            if (dimLabelY) this.addVerticalDimLine(svg, 80, mMinY, 80, mMaxY, dimLabelY, shapeLeftX);

            angles.forEach(a => {
                const svgX = mapFnX(a.origX);
                const svgY = mapFnY(a.origY);
                this.addAngleText(g, svgX, svgY, a.angle, a.dirX, a.dirY);
            });

        } else {
            const TARGET_H = 180; 
            let SCALE = TARGET_H / realH;
            shapeBottomY = SVG_H/2 + TARGET_H/2;
            
            if (realW * SCALE < SVG_W * 0.85) {
                mapFnX = (origX) => SVG_W/2 + (origX - (minX + maxX)/2) * SCALE;
                mapFnY = (origY) => SVG_H/2 + (origY - (minY + maxY)/2) * SCALE;
                const mappedPoints = hull.map(p => ({ x: mapFnX(p.x), y: mapFnY(p.y) }));
                this.drawPath(g, mappedPoints, true, "url(#hatchAll)");
                if (dimLabelX) this.addDimLine(svg, Math.min(...mappedPoints.map(p=>p.x)), SVG_H - 80, Math.max(...mappedPoints.map(p=>p.x)), SVG_H - 80, dimLabelX, shapeBottomY);
            } else {
                const endW = 1.5 * realH; 
                const clipLeft = minX + endW, clipRight = maxX - endW;
                const leftRealPoly = this.clipPolygonX(hull, clipLeft, true);
                const rightRealPoly = this.clipPolygonX(hull, clipRight, false);
                const GAP = 100, totalDrawnW = 2 * (endW * SCALE) + GAP;
                const startX = (SVG_W - totalDrawnW) / 2;

                mapFnX = (origX) => {
                    if (origX <= clipLeft + 0.01) return startX + (origX - minX) * SCALE;
                    if (origX >= clipRight - 0.01) return startX + (endW * SCALE) + GAP + (origX - clipRight) * SCALE;
                    return null;
                };
                mapFnY = (origY) => SVG_H/2 + (origY - (minY + maxY)/2) * SCALE;

                this.drawPath(g, leftRealPoly.map(p => ({ x: startX + (p.x - minX) * SCALE, y: mapFnY(p.y) })), true, "url(#hatchAll)");
                this.drawPath(g, rightRealPoly.map(p => ({ x: startX + (endW * SCALE) + GAP + (p.x - clipRight) * SCALE, y: mapFnY(p.y) })), true, "url(#hatchAll)");

                const breakX = startX + (endW * SCALE) + GAP / 2;
                this.drawZigZag(g, breakX, SVG_H/2 - TARGET_H/2, SVG_H/2 + TARGET_H/2);
                if (dimLabelX) this.addDimLine(svg, startX, SVG_H - 80, startX + totalDrawnW, SVG_H - 80, dimLabelX, shapeBottomY);
            }

            angles.forEach(a => {
                const svgX = mapFnX(a.origX);
                const svgY = mapFnY(a.origY);
                if (svgX !== null) { 
                    this.addAngleText(g, svgX, svgY, a.angle, a.dirX, a.dirY);
                }
            });
        }

        svg.appendChild(g);
        const existingLabel = container.querySelector('div');
        container.innerHTML = '';
        if(existingLabel) container.appendChild(existingLabel);
        container.appendChild(svg);
    }

    addVerticalDimLine(svg, x1, y1, x2, y2, text, shapeLeftX) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        if (shapeLeftX !== undefined) {
            const ext1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
            ext1.setAttribute("x1", shapeLeftX - 5); ext1.setAttribute("y1", y1);
            ext1.setAttribute("x2", x1 - 10); ext1.setAttribute("y2", y1);
            ext1.setAttribute("stroke", "#aaa"); ext1.setAttribute("stroke-width", "2");
            g.appendChild(ext1);

            const ext2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
            ext2.setAttribute("x1", shapeLeftX - 5); ext2.setAttribute("y1", y2);
            ext2.setAttribute("x2", x1 - 10); ext2.setAttribute("y2", y2);
            ext2.setAttribute("stroke", "#aaa"); ext2.setAttribute("stroke-width", "2");
            g.appendChild(ext2);
        }

        const l1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        l1.setAttribute("x1", x1); l1.setAttribute("y1", y1); l1.setAttribute("x2", x2); l1.setAttribute("y2", y2);
        l1.setAttribute("stroke", "#111"); l1.setAttribute("stroke-width", "2");
        g.appendChild(l1);

        const tick1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick1.setAttribute("x1", x1-10); tick1.setAttribute("y1", y1-10); tick1.setAttribute("x2", x1+10); tick1.setAttribute("y2", y1+10);
        tick1.setAttribute("stroke", "#111"); tick1.setAttribute("stroke-width", "3");
        g.appendChild(tick1);

        const tick2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick2.setAttribute("x1", x2-10); tick2.setAttribute("y1", y2-10); tick2.setAttribute("x2", x2+10); tick2.setAttribute("y2", y2+10);
        tick2.setAttribute("stroke", "#111"); tick2.setAttribute("stroke-width", "3");
        g.appendChild(tick2);

        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", x1 - 25); t.setAttribute("y", (y1 + y2) / 2);
        t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", "26px"); 
        t.setAttribute("font-weight", "bold"); t.setAttribute("fill", "#111");
        t.setAttribute("transform", `rotate(-90, ${x1 - 25}, ${(y1 + y2) / 2})`);
        t.textContent = text;
        g.appendChild(t);
        svg.appendChild(g);
    }

    addAngleText(g, x, y, angle, dx, dy) {
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", x + dx * 50);
        txt.setAttribute("y", y + dy * 50 + 8);
        txt.setAttribute("fill", "#d32f2f");
        txt.setAttribute("font-size", "22px");
        txt.setAttribute("font-weight", "bold");
        txt.setAttribute("text-anchor", "middle");
        txt.textContent = angle.toFixed(1) + "°";
        g.appendChild(txt);
    }

    drawPath(g, pts, closed, fill) {
        if (pts.length < 2) return;
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        let d = `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map(pt => `L ${pt.x} ${pt.y}`).join(' ');
        if (closed) d += " Z";
        p.setAttribute("d", d);
        p.setAttribute("fill", fill);
        p.setAttribute("stroke", "#111");
        p.setAttribute("stroke-width", "4");
        p.setAttribute("stroke-linejoin", "round");
        g.appendChild(p);
    }

    drawZigZag(g, x, top, bottom) {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const midY = (top + bottom) / 2, amp = 30;
        const d = `M ${x} ${top - 30} L ${x} ${midY - 35} L ${x - amp} ${midY - 15} L ${x + amp} ${midY + 15} L ${x} ${midY + 35} L ${x} ${bottom + 30}`;
        p.setAttribute("d", d);
        p.setAttribute("fill", "none");
        p.setAttribute("stroke", "#111");
        p.setAttribute("stroke-width", "3");
        g.appendChild(p);
    }

    addDimLine(svg, x1, y1, x2, y2, text, shapeBottomY) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        if (shapeBottomY !== undefined) {
            const ext1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
            ext1.setAttribute("x1", x1); ext1.setAttribute("y1", shapeBottomY + 5);
            ext1.setAttribute("x2", x1); ext1.setAttribute("y2", y1 + 10);
            ext1.setAttribute("stroke", "#aaa"); ext1.setAttribute("stroke-width", "2");
            g.appendChild(ext1);

            const ext2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
            ext2.setAttribute("x1", x2); ext2.setAttribute("y1", shapeBottomY + 5);
            ext2.setAttribute("x2", x2); ext2.setAttribute("y2", y1 + 10);
            ext2.setAttribute("stroke", "#aaa"); ext2.setAttribute("stroke-width", "2");
            g.appendChild(ext2);
        }

        const l1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        l1.setAttribute("x1", x1); l1.setAttribute("y1", y1); l1.setAttribute("x2", x2); l1.setAttribute("y2", y1);
        l1.setAttribute("stroke", "#111"); l1.setAttribute("stroke-width", "2");
        g.appendChild(l1);

        const tick1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick1.setAttribute("x1", x1-10); tick1.setAttribute("y1", y1+10); tick1.setAttribute("x2", x1+10); tick1.setAttribute("y2", y1-10);
        tick1.setAttribute("stroke", "#111"); tick1.setAttribute("stroke-width", "3");
        g.appendChild(tick1);

        const tick2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick2.setAttribute("x1", x2-10); tick2.setAttribute("y1", y2+10); tick2.setAttribute("x2", x2+10); tick2.setAttribute("y2", y2-10);
        tick2.setAttribute("stroke", "#111"); tick2.setAttribute("stroke-width", "3");
        g.appendChild(tick2);

        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("x", (x1 + x2) / 2 - 90); bg.setAttribute("y", y1 - 20);
        bg.setAttribute("width", 180); bg.setAttribute("height", 40); bg.setAttribute("fill", "#fff");
        g.appendChild(bg);

        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", (x1 + x2) / 2); t.setAttribute("y", y1 + 10);
        t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", "26px"); 
        t.setAttribute("font-weight", "bold"); t.setAttribute("fill", "#111");
        t.textContent = text;
        g.appendChild(t);
        svg.appendChild(g);
    }
}