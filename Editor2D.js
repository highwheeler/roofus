import { Board } from './Board.js';

/**
 * EDITOR 2D v21.5
 * [2026-02-23] Always generates whole files.
 * FIXED: Dispatches 'visibilityChanged' CustomEvent to match RoofGenerator listener.
 */
export class Editor2D {
    constructor(svgElement, onUpdate) {
        this.svg = svgElement;
        this.onUpdate = onUpdate;

        this.defaultParams = {
            pitch: 4,
            overhang: 12,
            rafterSpacing: 24,
            rafterSize: '2x8',
            edgeRafterSize: '2x6',
            fasciaSize: '1x8',
            plywoodSize: '4x8',
            plywoodThickness: '1/2',
            postHeight: 96,
            postThickness: 6,
            beamDepth: 6,
            beamThickness: 3
        };

        // UI Components
        this.ctxMenu = document.createElement('div');
        this.ctxMenu.style = `position: fixed; display: none; background: #333; color: white; 
                             border: 1px solid #555; padding: 5px 0; border-radius: 4px; 
                             z-index: 2000; box-shadow: 0 4px 10px rgba(0,0,0,0.5); font-size: 13px;`;
        document.body.appendChild(this.ctxMenu);

        // State
        this.shapes = [];
        this.undoStack = [];
        this.currentPoints = [];
        this.selectedIndices = new Set();
        this.clipboard = null;
        this.mode = 'draw';

        // Viewport
        this.scale = 1;
        const rect = svgElement.getBoundingClientRect();
        this.offset = {
            x: rect.width / 2,
            y: rect.height / 2
        };
        this.gridSize = 20;
        this.snapEnabled = true;

        // Interaction
        this.isPanning = false;
        this.isSelecting = false;
        this.isMoving = false;
        this.isDragging = false;
        this.hoveredHandle = null;
        this.lastMousePos = { x: 0, y: 0 };
        this.dragStart = { x: 0, y: 0 };
        this.selectionStart = { x: 0, y: 0 };
        this.selectedEdge = null;

        this.initLayers();
        this.initPolarInput();
        this.initEvents();
        this.updateToolbarUI();
        
        // Initial sync of checkboxes to the 3D generator
        setTimeout(() => this.broadcastInitialVisibility(), 200); 

        this.render();
    }

    // --- Initialization ---

    /**
     * Broadcasts visibility state using the 'visibilityChanged' CustomEvent.
     */
    broadcastVisibility(layer, visible) {
        
        const event = new CustomEvent('visibilityChanged', {
            detail: { layer: layer, visible: visible }
        });
        window.dispatchEvent(event);
    }

    /**
     * Scans all UI checkboxes and broadcasts their state on load.
     */
    broadcastInitialVisibility() {
        const toggles = document.querySelectorAll('.layer-toggle input[data-layer]');
        toggles.forEach(checkbox => {
            const layer = checkbox.getAttribute('data-layer');
            this.broadcastVisibility(layer, checkbox.checked);
        });
    }

    initLayers() {
        this.svg.innerHTML = `
            <defs>
                <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#ddd" stroke-width="0.5"/>
                </pattern>
            </defs>
            <g id="viewport">
                <rect id="grid-bg" x="-5000" y="-5000" width="10000" height="10000" fill="url(#gridPattern)" />
                <g id="shapes-layer"></g>
                <g id="measure-layer"></g>
                <g id="active-layer"></g>
                <g id="temp-layer"></g>
                <rect id="rubberband" fill="rgba(0, 120, 215, 0.1)" stroke="#0078d7" stroke-dasharray="2" visibility="hidden"></rect>
                <g id="handle-layer"></g>
            </g>
        `;
        this.updateViewport();
    }

    initPolarInput() {
        if (document.getElementById('polar-input')) return;
        this.polarBox = document.createElement('input');
        this.polarBox.id = 'polar-input';
        this.polarBox.style = `position: absolute; display: none; background: white; border: 1px solid #0078d7; 
                               outline: none; font-family: monospace; padding: 2px; z-index: 1000; width: 80px;`;
        this.polarBox.placeholder = "D<A";
        document.body.appendChild(this.polarBox);
        this.polarBox.addEventListener('keydown', e => { if (e.key === 'Enter') this.processPolar(); });
    }

    // --- Viewport & Zoom (Mouse Centered) ---

    handleWheel(e) {
        e.preventDefault();
        const rect = this.svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const delta = -e.deltaY * 0.0015;
        const oldScale = this.scale;
        const newScale = Math.min(Math.max(this.scale + (this.scale * delta), 0.05), 20);

        this.offset.x = mouseX - (mouseX - this.offset.x) * (newScale / oldScale);
        this.offset.y = mouseY - (mouseY - this.offset.y) * (newScale / oldScale);

        this.scale = newScale;
        this.updateViewport();
    }

    updateViewport() {
        const vp = this.svg.querySelector('#viewport');
        if (vp) vp.setAttribute('transform', `translate(${this.offset.x}, ${this.offset.y}) scale(${this.scale})`);
        this.render();
    }

    getMousePos(e) {
        const rect = this.svg.getBoundingClientRect();
        let x = (e.clientX - rect.left - this.offset.x) / this.scale;
        let y = (e.clientY - rect.top - this.offset.y) / this.scale;
        if (this.snapEnabled) {
            x = Math.round(x / this.gridSize) * this.gridSize;
            y = Math.round(y / this.gridSize) * this.gridSize;
        }
        return { x, y };
    }

    // --- Interaction Handlers ---

    handleDown(e) {
        const pt = this.getMousePos(e);
        this.dragStart = pt;

        if (e.button === 1) {
            this.isPanning = true;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            return;
        }

        if (this.mode === 'select') {
            if (this.hoveredHandle) {
                this.saveState();
                this.isDragging = true;
                return;
            }

            const edgeMatch = this.detectEdgeClick(pt);
            let clickedIdx = -1;
            for (let i = this.shapes.length - 1; i >= 0; i--) {
                if (this.isPointInShape(pt, this.shapes[i])) { clickedIdx = i; break; }
            }

            if (clickedIdx !== -1 || edgeMatch) {
                const finalIdx = clickedIdx !== -1 ? clickedIdx : edgeMatch.shapeIdx;
                if (!e.ctrlKey && !this.selectedIndices.has(finalIdx)) this.selectedIndices.clear();
                this.selectedIndices.add(finalIdx);

                if (edgeMatch) {
                    this.selectedEdge = edgeMatch;
                    const shape = this.shapes[edgeMatch.shapeIdx];
                    if (!shape.edgeParams) shape.edgeParams = shape.points.map(() => ({ endStyle: 'Gable' }));
                    this.svg.dispatchEvent(new CustomEvent('edgeSelected', { detail: { shape, edgeIdx: edgeMatch.edgeIdx } }));
                } else {
                    this.selectedEdge = null;
                    this.svg.dispatchEvent(new CustomEvent('shapeSelected', { detail: this.shapes[clickedIdx] }));
                }
                this.isMoving = true;
                this.saveState();
            } else {
                if (!e.ctrlKey) this.selectedIndices.clear();
                this.isSelecting = true;
                this.selectionStart = pt;
                const rb = this.svg.querySelector('#rubberband');
                rb.setAttribute('visibility', 'visible');
                rb.setAttribute('x', pt.x); rb.setAttribute('y', pt.y);
                rb.setAttribute('width', 0); rb.setAttribute('height', 0);
                this.svg.dispatchEvent(new CustomEvent('clearSelection'));
            }
        } else {
            if (this.currentPoints.length > 2) {
                const start = this.currentPoints[0];
                if (Math.hypot(pt.x - start.x, pt.y - start.y) < 15 / this.scale) {
                    this.finishDrawing();
                    return;
                }
            }
            this.currentPoints.push(pt);
            this.showPolarInput(e.clientX, e.clientY);
        }
        this.render();
    }

    handleMove(e) {
        const pt = this.getMousePos(e);
        const temp = this.svg.querySelector('#temp-layer');
        temp.innerHTML = '';

        if (this.isPanning) {
            this.offset.x += e.clientX - this.lastMousePos.x;
            this.offset.y += e.clientY - this.lastMousePos.y;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.updateViewport();
            return;
        }

        if (this.isMoving) {
            const dx = pt.x - this.dragStart.x;
            const dy = pt.y - this.dragStart.y;
            this.selectedIndices.forEach(idx => {
                this.shapes[idx].points.forEach(p => { p.x += dx; p.y += dy; });
            });
            this.dragStart = pt;
            this.sync();
            return;
        }

        if (this.isDragging && this.hoveredHandle) {
            this.shapes[this.hoveredHandle.sIdx].points[this.hoveredHandle.pIdx] = pt;
            this.sync();
            return;
        }

        if (this.isSelecting) {
            const rb = this.svg.querySelector('#rubberband');
            const x = Math.min(pt.x, this.selectionStart.x), y = Math.min(pt.y, this.selectionStart.y);
            const w = Math.abs(pt.x - this.selectionStart.x), h = Math.abs(pt.y - this.selectionStart.y);
            rb.setAttribute('x', x); rb.setAttribute('y', y);
            rb.setAttribute('width', w); rb.setAttribute('height', h);
            this.updateSelection(x, y, w, h, e.ctrlKey);
            return;
        }

        this.detectHover(pt);

        if (this.currentPoints.length > 0 && this.mode === 'draw') {
            const last = this.currentPoints[this.currentPoints.length - 1];
            temp.appendChild(this.createSVG('line', {
                x1: last.x, y1: last.y, x2: pt.x, y2: pt.y,
                stroke: '#0078d7', 'stroke-dasharray': 4 / this.scale, 'stroke-width': 1 / this.scale
            }));
            this.addMeasure(temp, last, pt, '#0078d7');
        }
    }

    // --- Geometry Logic ---

    isPointInShape(pt, shape) {
        let inside = false;
        for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
            const xi = shape.points[i].x, yi = shape.points[i].y;
            const xj = shape.points[j].x, yj = shape.points[j].y;
            const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    detectEdgeClick(pt) {
        const threshold = 10 / this.scale;
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            const shape = this.shapes[i];
            for (let j = 0; j < shape.points.length; j++) {
                const p1 = shape.points[j];
                const p2 = shape.points[(j + 1) % shape.points.length];
                if (this.distToSegment(pt, p1, p2) < threshold) return { shapeIdx: i, edgeIdx: j };
            }
        }
        return null;
    }

    distToSegment(p, v, w) {
        const l2 = Math.hypot(v.x - w.x, v.y - w.y) ** 2;
        if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
    }

    detectHover(pt) {
        this.hoveredHandle = null;
        for (let sIdx = 0; sIdx < this.shapes.length; sIdx++) {
            for (let pIdx = 0; pIdx < this.shapes[sIdx].points.length; pIdx++) {
                const hPt = this.shapes[sIdx].points[pIdx];
                if (Math.hypot(pt.x - hPt.x, pt.y - hPt.y) < 10 / this.scale) {
                    this.hoveredHandle = { sIdx, pIdx };
                    return;
                }
            }
        }
    }

    // --- Shape Operations ---

    finishDrawing() {
        this.saveState();
        const newShape = {
            id: crypto.randomUUID(),
            points: [...this.currentPoints],
            closed: true,
            params: { ...this.defaultParams },
            edgeParams: this.currentPoints.map(() => ({ endStyle: 'Gable' }))
        };
        this.shapes.push(newShape);
        this.currentPoints = [];
        this.polarBox.style.display = 'none';
        this.mode = 'select';
        this.sync();
        this.updateToolbarUI();
    }

    createPremade(w, h) {
        this.saveState();
        const newShape = {
            id: crypto.randomUUID(),
            points: [
                { x: - w , y: - h  },
                { x: - w , y: + h  },
                { x: + w , y: + h },
                { x: + w , y: - h }
            ],
            closed: true,
            params: { ...this.defaultParams },
            edgeParams: Array(4).fill(null).map(() => ({ endStyle: 'Hip' }))
        };
        this.shapes.push(newShape);
        this.selectedIndices.clear();
        this.selectedIndices.add(this.shapes.length - 1);
        this.mode = 'select';
        this.sync();
        this.updateToolbarUI();
        this.svg.dispatchEvent(new CustomEvent('shapeSelected', { detail: newShape }));
    }

    updateSelectedParams(key, value, isEdgeParam = false) {
        this.saveState();
        if (isEdgeParam && this.selectedEdge) {
            this.shapes[this.selectedEdge.shapeIdx].edgeParams[this.selectedEdge.edgeIdx][key] = value;
        } else {
            this.selectedIndices.forEach(idx => { 
                this.shapes[idx].params[key] = value; 
            });
        }
        this.sync();
    }

    deleteSelected() {
        if (this.selectedIndices.size === 0) return;
        this.saveState();
        this.shapes = this.shapes.filter((_, i) => !this.selectedIndices.has(i));
        this.selectedIndices.clear();
        this.sync();
    }

    // --- State & Rendering ---

    sync() { this.render(); this.onUpdate(this.shapes); }

    saveState() {
        this.undoStack.push(JSON.stringify(this.shapes));
        if (this.undoStack.length > 50) this.undoStack.shift();
    }

    undo() {
        if (this.undoStack.length > 0) {
            this.shapes = JSON.parse(this.undoStack.pop());
            this.sync();
        }
    }

    render() {
        ['shapes-layer', 'measure-layer', 'active-layer', 'handle-layer'].forEach(id => {
            const l = this.svg.querySelector(`#${id}`);
            if (l) l.innerHTML = '';
        });

        const hSize = 8 / this.scale;
        const strokeW = 2 / this.scale;

        this.shapes.forEach((shape, sIdx) => {
            const isSelected = this.selectedIndices.has(sIdx);

            shape.points.forEach((p1, pIdx) => {
                const p2 = shape.points[(pIdx + 1) % shape.points.length];
                const style = shape.edgeParams?.[pIdx]?.endStyle || 'Hip';

                let color = '#333', dash = 'none', width = strokeW;
                if (style === 'Gable') { color = '#ff3b30'; width = strokeW * 2.5; }
                else if (style === 'Hip') { color = '#007aff'; }
                else if (style === 'Flat') { color = '#4cd964'; dash = '4,2'; }

                this.svg.querySelector('#shapes-layer').appendChild(this.createSVG('line', {
                    x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
                    stroke: color, 'stroke-width': width, 'stroke-dasharray': dash
                }));

                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const label = this.createSVG('text', {
                    x: midX, y: midY + (15 / this.scale), 
                    fill: color,
                    'font-size': `${10 / this.scale}px`,
                    'text-anchor': 'middle',
                    'font-weight': 'bold',
                    'pointer-events': 'none',
                    'font-family': 'Arial, sans-serif'
                });
                label.textContent = style.toUpperCase();
                this.svg.querySelector('#measure-layer').appendChild(label);

                if (style === 'Gable') {
                    this.svg.querySelector('#shapes-layer').appendChild(this.createSVG('circle', {
                        cx: midX, cy: midY, r: 3 / this.scale, fill: '#ff3b30'
                    }));
                }

                if (this.selectedEdge && this.selectedEdge.shapeIdx === sIdx && this.selectedEdge.edgeIdx === pIdx) {
                    this.svg.querySelector('#active-layer').appendChild(this.createSVG('line', {
                        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
                        stroke: '#ff9800', 'stroke-width': strokeW * 2.5, 'stroke-linecap': 'round'
                    }));
                }

                this.addMeasure(this.svg.querySelector('#measure-layer'), p1, p2);
                this.svg.querySelector('#handle-layer').appendChild(this.createSVG('rect', {
                    x: p1.x - hSize / 2, y: p1.y - hSize / 2, width: hSize, height: hSize,
                    fill: isSelected ? '#0078d7' : 'white', stroke: '#333', 'stroke-width': 1 / this.scale
                }));
            });

            const ptsString = shape.points.map(p => `${p.x},${p.y}`).join(' ');
            this.svg.querySelector('#shapes-layer').prepend(this.createSVG('polygon', {
                points: ptsString, fill: isSelected ? 'rgba(0, 120, 215, 0.1)' : 'rgba(139, 69, 19, 0.1)'
            }));
        });

        if (this.currentPoints.length > 0) {
            const pts = this.currentPoints.map(p => `${p.x},${p.y}`).join(' ');
            this.svg.querySelector('#active-layer').appendChild(this.createSVG('polyline', {
                points: pts, stroke: '#0078d7', fill: 'none', 'stroke-width': strokeW
            }));
            for (let i = 0; i < this.currentPoints.length - 1; i++) {
                this.addMeasure(this.svg.querySelector('#measure-layer'), this.currentPoints[i], this.currentPoints[i + 1], '#0078d7');
            }
        }
    }

    addMeasure(container, p1, p2, color = '#666') {
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(0);
        const text = this.createSVG('text', {
            x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - 5 / this.scale,
            fill: color, 'font-size': `${12 / this.scale}px`, 'text-anchor': 'middle', 'pointer-events': 'none', 'font-family': 'monospace'
        });
        text.textContent = dist;
        container.appendChild(text);
    }

    // --- UI Helpers ---

    showContextMenu(x, y, edgeMatch) {
        const styles = ['Hip', 'Gable', 'Flat'];
        this.ctxMenu.innerHTML = '';
        this.ctxMenu.style.left = `${x}px`;
        this.ctxMenu.style.top = `${y}px`;
        this.ctxMenu.style.display = 'block';
        styles.forEach(style => {
            const item = document.createElement('div');
            item.textContent = style;
            item.style = `padding: 8px 20px; cursor: pointer; transition: 0.2s;`;
            item.onmouseover = () => { item.style.background = '#0078d7'; };
            item.onmouseout = () => { item.style.background = 'none'; };
            item.onclick = () => {
                this.updateSelectedParams('endStyle', style, true);
                this.ctxMenu.style.display = 'none';
            };
            this.ctxMenu.appendChild(item);
        });
    }

    showPolarInput(x, y) {
        this.polarBox.style.display = 'block';
        this.polarBox.style.left = `${x + 10}px`;
        this.polarBox.style.top = `${y + 10}px`;
        this.polarBox.focus();
    }

    processPolar() {
        const val = this.polarBox.value;
        if (val.includes('<') && this.currentPoints.length > 0) {
            const [dist, angle] = val.split('<').map(Number);
            const last = this.currentPoints[this.currentPoints.length - 1];
            const rad = (angle * Math.PI) / 180;
            this.currentPoints.push({ x: last.x + dist * Math.cos(rad), y: last.y - dist * Math.sin(rad) });
            this.render();
        }
        this.polarBox.value = "";
    }

    updateToolbarUI() {
        const drawBtn = document.getElementById('btnDraw');
        const selectBtn = document.getElementById('btnSelect');
        if (!drawBtn || !selectBtn) return;
        drawBtn.classList.toggle('active', this.mode === 'draw');
        selectBtn.classList.toggle('active', this.mode === 'select');
    }

    updateSelection(x, y, w, h, isAdding) {
        if (!isAdding) this.selectedIndices.clear();
        this.shapes.forEach((shape, idx) => {
            if (shape.points.some(p => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h)) {
                this.selectedIndices.add(idx);
            }
        });
        this.render();
    }

    // --- Clipboard ---

    copy() {
        if (this.selectedIndices.size === 0) return;
        this.clipboard = Array.from(this.selectedIndices).map(i => JSON.parse(JSON.stringify(this.shapes[i])));
    }

    paste() {
        if (!this.clipboard) return;
        this.saveState();
        this.selectedIndices.clear();
        this.clipboard.forEach(shape => {
            const pasted = JSON.parse(JSON.stringify(shape));
            pasted.id = crypto.randomUUID();
            pasted.points.forEach(p => { p.x += 40; p.y += 40; });
            this.shapes.push(pasted);
            this.selectedIndices.add(this.shapes.length - 1);
        });
        this.sync();
    }

    // --- Events ---

    initEvents() {
        this.svg.addEventListener('mousedown', e => this.handleDown(e));
        this.svg.addEventListener('mousemove', e => this.handleMove(e));
        this.svg.addEventListener('wheel', e => this.handleWheel(e), { passive: false });

        // Bind visibility toggles to the 'visibilityChanged' custom event
        const toggles = document.querySelectorAll('.layer-toggle input[data-layer]');
        toggles.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const layer = e.target.getAttribute('data-layer');
                this.broadcastVisibility(layer, e.target.checked);
            });
        });

        const spacingSlider = document.getElementById('spacing-slider');
        const spacingDisplay = document.getElementById('spacing-val');
        if (spacingSlider) {
            spacingSlider.oninput = (e) => {
                const val = parseInt(e.target.value);
                if (spacingDisplay) spacingDisplay.textContent = val;
                this.updateSelectedParams('rafterSpacing', val);
            };
        }

        const pitchSlider = document.getElementById('pitch-slider');
        const pitchDisplay = document.getElementById('pitch-val');
        if (pitchSlider) {
            pitchSlider.oninput = (e) => {
                const val = e.target.value;
                if (pitchDisplay) pitchDisplay.textContent = val;
                this.updateSelectedParams('pitch', parseFloat(val));
            };
        }

        const overhangSlider = document.getElementById('overhang-slider');
        const overhangDisplay = document.getElementById('overhang-val');
        if (overhangSlider) {
            overhangSlider.oninput = (e) => {
                const val = parseInt(e.target.value);
                if (overhangDisplay) overhangDisplay.textContent = val;
                this.updateSelectedParams('overhang', val);
            };
        }

        const postHeightSlider = document.getElementById('post-height-slider');
        const postHeightDisplay = document.getElementById('post-height-val');
        if (postHeightSlider) {
            postHeightSlider.oninput = (e) => {
                const val = parseInt(e.target.value);
                if (postHeightDisplay) postHeightDisplay.textContent = val;
                this.updateSelectedParams('postHeight', val);
            };
        }

        const postThickSelect = document.getElementById('postThickness-select');
        if (postThickSelect) {
            postThickSelect.onchange = (e) => {
                const val = parseInt(e.target.value);
                this.updateSelectedParams('postThickness', val);
            };
        }

        this.svg.addEventListener('shapeSelected', (e) => {
            const shape = e.detail;
            if (shape.params) {
                if (pitchSlider) { pitchSlider.value = shape.params.pitch; if (pitchDisplay) pitchDisplay.textContent = shape.params.pitch; }
                if (spacingSlider) { spacingSlider.value = shape.params.rafterSpacing; if (spacingDisplay) spacingDisplay.textContent = shape.params.rafterSpacing; }
                if (overhangSlider) { overhangSlider.value = shape.params.overhang; if (overhangDisplay) overhangDisplay.textContent = shape.params.overhang; }
                if (postHeightSlider) { 
                    postHeightSlider.value = shape.params.postHeight || 96; 
                    if (postHeightDisplay) postHeightDisplay.textContent = postHeightSlider.value; 
                }
                if (postThickSelect) { 
                    postThickSelect.value = shape.params.postThickness || 6; 
                }
            }
        });

        this.svg.addEventListener('contextmenu', e => {
            e.preventDefault();
            const edge = this.detectEdgeClick(this.getMousePos(e));
            if (edge) this.showContextMenu(e.clientX, e.clientY, edge);
            else this.ctxMenu.style.display = 'none';
        });

        window.addEventListener('mouseup', () => {
            this.isSelecting = this.isPanning = this.isDragging = this.isMoving = false;
            const rb = this.svg.querySelector('#rubberband');
            if (rb) rb.setAttribute('visibility', 'hidden');
        });

        window.addEventListener('click', () => { this.ctxMenu.style.display = 'none'; });

        window.addEventListener('keydown', e => {
            if (e.key === 'Escape') { this.polarBox.style.display = 'none'; this.currentPoints = []; this.render(); }
            if (e.ctrlKey && e.key === 'z') this.undo();
            if (e.ctrlKey && e.key === 'c') this.copy();
            if (e.ctrlKey && e.key === 'v') this.paste();
            if (e.key === 'Delete') this.deleteSelected();
        });
    }

    createSVG(type, attrs) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", type);
        for (let k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    }
}