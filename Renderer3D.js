import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { RoofGenerator } from './RoofGenerator';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';

/**
 * RENDERER 3D
 * [2026-03-10] Always generates whole files.
 * FIXED: Resolved "too much recursion" by removing controls.update() from the render loop.
 */
export class Renderer3D {
    constructor(container) {
        this.container = container;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x555555);

        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 5000);
        this.camera.position.set(200, 200, 200);
        this.camera.up.set(0, 1, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.autoClear = false;
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.screenSpacePanning = true;
        this.controls.enableDamping = false; 
        this.controls.rotateSpeed = 0.4;
        this.controls.zoomSpeed = 0.8;
        this.controls.panSpeed = 0.6;
        this.controls.enableZoom = true;

        // FIXED: The 'change' event should ONLY trigger the drawing logic, 
        // NEVER a function that calls controls.update().
        this.controls.addEventListener('change', () => {
            this.draw();
        });

        this.roofGen = new RoofGenerator(this.scene);
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.inspectionGroup = new THREE.Group(); 
        this.scene.add(this.inspectionGroup);

        this.measureLabel = this.createPopupLabel();
        this.detailPanel = this.createDetailPanel(); 

        this.hudScene = new THREE.Scene();
        this.hudCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

        this.initLights();
        this.initHelpers();
        this.initViewCube();
        this.initAxisArrows();
        this.initRotationButtons();
        this.loadCameraState(this.camera, this.controls);

        this.mouseStart = new THREE.Vector2();
        this.clickThreshold = 5;

        this.renderer.domElement.addEventListener('mousedown', (e) => {
            this.onHUDClick(e);
            this.mouseStart.set(e.clientX, e.clientY);
        });

        this.renderer.domElement.addEventListener('mouseup', (e) => {
            const moveDist = Math.hypot(e.clientX - this.mouseStart.x, e.clientY - this.mouseStart.y);
            if (moveDist < this.clickThreshold) {
                this.handleSelection(e);
            }
        });

        this.container.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('resize', () => this.onWindowResize());

        this.draw();
    }

    createPopupLabel() {
        const div = document.createElement('div');
        div.style = `position: absolute; color: #00ff00; background: rgba(0,0,0,0.85); 
                     padding: 4px 8px; border-radius: 4px; font-family: 'Courier New', monospace; 
                     font-size: 12px; pointer-events: none; display: none; border: 1px solid #00ff00; z-index: 100;`;
        this.container.appendChild(div);
        return div;
    }

    createDetailPanel() {
        const div = document.createElement('div');
        div.style = `position: absolute; top: 20px; right: 20px; width: 240px; 
                     background: rgba(10,10,10,0.95); color: #00ff00; padding: 15px; 
                     border: 1px solid #00ff00; border-radius: 4px; font-family: 'Courier New', monospace; 
                     display: none; z-index: 105; pointer-events: none; box-shadow: 0 0 15px rgba(0,255,0,0.2);`;
        this.container.appendChild(div);
        return div;
    }

    initLights() {
        const sun = new THREE.DirectionalLight(0xffffff, 2);
        sun.position.set(1, 1, 1);
        const fill = new THREE.DirectionalLight(0xffffff, 0.5);
        fill.position.set(-1, -1, -1);
        this.scene.add(sun, fill, new THREE.AmbientLight(0xffffff, 2));
    }

    initHelpers() {
        const floorGrid = new THREE.GridHelper(2000, 40, 0x444444, 0x222222);
        floorGrid.isHelper = true;
        this.scene.add(floorGrid);
    }

    handleSelection(event) {
        if (this.isMouseOverHUD(event)) return;

        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true)
            .filter(hit => hit.object.isMesh && !hit.object.isHelper && hit.object.visible);

        if (intersects.length > 0) {
            this.inspectObject(intersects[0].object);
        } else {
            this.resetInspection();
        }
        this.draw(); 
    }

    inspectObject(obj) {
        this.selectedObject = obj;
        this.inspectionGroup.clear();

        this.scene.traverse(node => {
            if (node.isMesh && !node.isHelper) {
                if (!node.userData.originalMaterial) node.userData.originalMaterial = node.material;
                node.material = node.userData.originalMaterial.clone();
                node.material.transparent = true;

                if (node === obj) {
                    node.material.opacity = 1.0;
                    node.material.emissive?.setHex(0x444400); 
                } else {
                    node.material.opacity = 0.15; 
                }
            }
        });

        const data = obj.userData || {};
        const isSheathing = data.memberType === 'sheathing';
        const name = data.memberType ? data.memberType.toUpperCase() : "MEMBER";
        const id = data.id || "N/A";
        
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        box.getSize(size);

        const L = data.length !== undefined ? data.length.toFixed(2) : Math.max(size.x, size.z).toFixed(2);
        const W = data.width !== undefined ? data.width.toFixed(2) : (isSheathing ? "48.00" : "7.25");
        const T = data.thick !== undefined ? data.thick : "0.5";
        
        this.detailPanel.style.display = 'block';
        this.detailPanel.innerHTML = `
            <div style="border-bottom:1px solid #00ff00; padding-bottom:6px; margin-bottom:10px; font-weight:bold; letter-spacing:1px;">${name}</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                <span style="color:#888">ID:</span> <span>${id}</span>
                <span style="color:#888">LENGTH:</span> <span>${L}"</span>
                <span style="color:#888">WIDTH:</span> <span>${W}"</span>
                <span style="color:#888">THICK:</span> <span>${T}"</span>
            </div>
        `;
        this.drawDimensionsFor(obj);
    }

    resetInspection() {
        this.selectedObject = null;
        this.inspectionGroup.clear();
        this.detailPanel.style.display = 'none';

        this.scene.traverse(node => {
            if (node.isMesh && !node.isHelper && node.userData.originalMaterial) {
                node.material = node.userData.originalMaterial;
                node.material.transparent = true;
                node.material.opacity = 1.0;
                node.material.emissive?.setHex(0x000000);
            }
        });
        this.draw();
    }

    drawDimensionsFor(mesh) {
        if (!mesh.geometry.attributes.position) return;
        const posAttr = mesh.geometry.attributes.position;
        const matrix = mesh.matrixWorld;
        const pts = [];

        for (let i = 0; i < posAttr.count; i++) {
            const v = new THREE.Vector3().fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
            if (!pts.some(p => p.distanceTo(v) < 0.1)) pts.push(v);
        }

        const edges = [];
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const dist = pts[i].distanceTo(pts[j]);
                const dir = new THREE.Vector3().subVectors(pts[j], pts[i]).normalize();
                const localDir = dir.clone().applyQuaternion(mesh.quaternion.clone().invert());
                const isOrthogonal = Math.abs(localDir.x) > 0.8 || Math.abs(localDir.y) > 0.8 || Math.abs(localDir.z) > 0.8;
                if (isOrthogonal && dist > 1.0) edges.push({ p1: pts[i], p2: pts[j], dist });
            }
        }

        const uniqueEdges = [];
        edges.forEach(edge => {
            if (!uniqueEdges.some(ue => (ue.p1.distanceTo(edge.p1) < 1 && ue.p2.distanceTo(edge.p2) < 1) || (ue.p1.distanceTo(edge.p2) < 1 && ue.p2.distanceTo(edge.p1) < 1))) {
                uniqueEdges.push(edge);
            }
        });

        uniqueEdges.sort((a, b) => b.dist - a.dist);
        const longest = uniqueEdges[0];
        if (longest) {
            this.createArchitecturalDim(longest.p1, longest.p2, new THREE.Vector3(0, 1, 0), 15, `L: ${longest.dist.toFixed(1)}"`);
        }

        const box = new THREE.Box3().setFromObject(mesh);
        const topCenter = new THREE.Vector3( (box.min.x + box.max.x)/2, box.max.y + 20, (box.min.z + box.max.z)/2 );
        this.add3DLabel(`PITCH: ${this.calculatePitch(pts)}°`, topCenter.x, topCenter.y, topCenter.z, "#ffaa00");
    }

    calculatePitch(pts) {
        if (pts.length < 2) return "0";
        const direction = pts[1].clone().sub(pts[0]).normalize();
        const angleRad = Math.atan2(Math.abs(direction.y), Math.sqrt(direction.x ** 2 + direction.z ** 2));
        return (angleRad * 180 / Math.PI).toFixed(1);
    }

    createArchitecturalDim(p1, p2, direction, distance, text) {
        const dimColor = 0x00ff00;
        const off1 = p1.clone().addScaledVector(direction, distance);
        const off2 = p2.clone().addScaledVector(direction, distance);
        const extMat = new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.5 });
        this.inspectionGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, off1]), extMat));
        this.inspectionGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p2, off2]), extMat));
        const mainLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([off1, off2]), new THREE.LineBasicMaterial({ color: dimColor }));
        this.inspectionGroup.add(mainLine);
        this.addArrowHead(off1, off2, dimColor);
        this.addArrowHead(off2, off1, dimColor);
        const mid = new THREE.Vector3().lerpVectors(off1, off2, 0.5);
        this.add3DLabel(text, mid.x, mid.y + 4, mid.z, "#00ff00");
    }

    addArrowHead(start, end, color) {
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        this.inspectionGroup.add(new THREE.ArrowHelper(dir, start, 4, color, 1.5, 1.0));
    }

    isMouseOverHUD(event) {
        const rect = this.container.getBoundingClientRect();
        const x = event.clientX - rect.left - 10;
        const y = rect.height - (event.clientY - rect.top) - 10;
        return (x >= 0 && x <= 120 && y >= 0 && y <= 120);
    }

    initAxisArrows() {
        const axisLength = 2.2;
        const axes = [{ dir: [1, 0, 0], color: 0xff0000, label: 'X' }, { dir: [0, 1, 0], color: 0x00ff00, label: 'Y' }, { dir: [0, 0, 1], color: 0x0000ff, label: 'Z' }];
        axes.forEach(axis => {
            const dir = new THREE.Vector3(...axis.dir);
            this.hudScene.add(new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), axisLength, axis.color, 0.4, 0.2));
            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.font = 'bold 44px Arial';
            ctx.fillStyle = '#' + axis.color.toString(16).padStart(6, '0');
            ctx.textAlign = 'center';
            ctx.fillText(axis.label, 32, 48);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
            sprite.position.copy(dir).multiplyScalar(axisLength + 0.6);
            sprite.scale.set(0.8, 0.8, 1);
            this.hudScene.add(sprite);
        });
    }

    initViewCube() {
        const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        const faces = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK'];
        const materials = faces.map(text => {
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 128, 128);
            ctx.strokeStyle = '#666'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, 128, 128);
            ctx.font = 'bold 26px Arial'; ctx.fillStyle = '#eee'; ctx.textAlign = 'center'; ctx.fillText(text, 64, 75);
            return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) });
        });
        this.viewCube = new THREE.Mesh(geometry, materials);
        this.hudScene.add(this.viewCube, new THREE.AmbientLight(0xffffff, 1));
    }

    initRotationButtons() {
        const btnStyle = "background:#333; color:white; border:1px solid #555; padding:4px 8px; cursor:pointer; font-size:14px; border-radius:4px;";
        const ui = document.createElement('div');
        ui.style = `position: absolute; bottom: 15px; left: 140px; display: flex; gap: 8px; z-index: 101; align-items: center;`;
        ui.innerHTML = `
            <button id="rot-ccw" style="${btnStyle}">↺</button>
            <button id="rot-up" style="${btnStyle}">↑</button>
            <button id="rot-down" style="${btnStyle}">↓</button>
            <button id="rot-cw" style="${btnStyle}">↻</button>
            <div style="height:20px; width:1px; background:#555; margin: 0 5px;"></div>
            <button id="export-obj" style="${btnStyle} background:#27ae60;">OBJ</button>
            <button id="export-stl" style="${btnStyle} background:#2980b9;">STL</button>
        `;
        this.container.appendChild(ui);
        ui.querySelector('#rot-ccw').onclick = () => this.rollCamera(-Math.PI / 2);
        ui.querySelector('#rot-cw').onclick = () => this.rollCamera(Math.PI / 2);
        ui.querySelector('#rot-up').onclick = () => this.tiltCamera(Math.PI / 2);
        ui.querySelector('#rot-down').onclick = () => this.tiltCamera(-Math.PI / 2);
        ui.querySelector('#export-obj').onclick = () => this.exportToOBJ();
        ui.querySelector('#export-stl').onclick = () => this.exportToSTL();
    }

    exportToOBJ() {
        const exporter = new OBJExporter();
        const result = exporter.parse(this.scene);
        this.downloadFile(result, 'obj');
    }

    exportToSTL() {
        const exporter = new STLExporter();
        const result = exporter.parse(this.scene, { binary: true });
        this.downloadFile(new Blob([result], { type: 'application/octet-stream' }), 'stl');
    }

    downloadFile(content, ext) {
        const isBlob = content instanceof Blob;
        const url = isBlob ? URL.createObjectURL(content) : URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `Roof_Export.${ext}`;
        link.click();
        URL.revokeObjectURL(url);
    }

    rollCamera(angle) {
        const dir = this.camera.getWorldDirection(new THREE.Vector3());
        const quat = new THREE.Quaternion().setFromAxisAngle(dir, angle);
        this.camera.up.applyQuaternion(quat);
        this.controls.update(); // Update once
        this.draw();
    }

    tiltCamera(angle) {
        const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const quat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
        this.camera.position.applyQuaternion(quat);
        this.camera.up.applyQuaternion(quat);
        this.camera.lookAt(0, 0, 0);
        this.controls.target.set(0, 0, 0);
        this.controls.update(); // Update once
        this.draw();
    }

    onHUDClick(event) {
        const rect = this.container.getBoundingClientRect();
        const size = 120;
        const x = event.clientX - rect.left - 10;
        const y = rect.height - (event.clientY - rect.top) - 10;
        if (x >= 0 && x <= size && y >= 0 && y <= size) {
            const pointer = new THREE.Vector2((x / size) * 2 - 1, (y / size) * 2 - 1);
            this.raycaster.setFromCamera(pointer, this.hudCamera);
            const hits = this.raycaster.intersectObject(this.viewCube);
            if (hits.length > 0) this.orientCamera(hits[0].face.materialIndex);
        }
    }

    orientCamera(faceIndex) {
        const dist = this.camera.position.length() || 800;
        const targets = [[dist, 0, 0], [-dist, 0, 0], [0, dist, 0], [0, -dist, 0], [0, 0, dist], [0, 0, -dist]];
        const t = targets[faceIndex];
        this.camera.position.set(t[0], t[1], t[2]);
        this.camera.up.set(0, (faceIndex === 2 || faceIndex === 3) ? 0 : 1, faceIndex === 2 ? -1 : 1);
        this.camera.lookAt(0, 0, 0);
        this.controls.target.set(0, 0, 0);
        this.controls.update(); // Update once
        this.draw();
    }

    onMouseMove(event) {
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true).filter(h => !h.object.isHelper && h.object.visible);
        if (intersects.length > 0) {
            const p = intersects[0].point;
            this.measureLabel.style.display = 'block';
            this.measureLabel.style.left = (event.clientX - rect.left + 15) + 'px';
            this.measureLabel.style.top = (event.clientY - rect.top - 15) + 'px';
            this.measureLabel.innerHTML = `Y: ${p.y.toFixed(1)}" | X: ${p.x.toFixed(1)}" | Z: ${p.z.toFixed(1)}"`;
        } else {
            this.measureLabel.style.display = 'none';
        }
    }

    sync(shapes) {
         this.roofGen.generate(shapes);
         this.draw();
    }

    add3DLabel(text, x, y, z, color = "#00ffcc") {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 24px Arial'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, 128, 42);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
        sprite.position.set(x, y, z); sprite.scale.set(30, 7.5, 1); sprite.isHelper = true;
        this.inspectionGroup.add(sprite);
    }

    /**
     * DRAW
     * Pure rendering logic without any camera state modification.
     */
    draw() {
        this.saveCameraState(this.camera, this.controls);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);

        this.hudCamera.quaternion.copy(this.camera.quaternion);
        this.hudCamera.position.copy(this.camera.position).setLength(8);
        this.hudCamera.lookAt(0, 0, 0);

        this.renderer.setViewport(10, 10, 120, 120);
        this.renderer.render(this.hudScene, this.hudCamera);
        this.renderer.setViewport(0, 0, this.container.clientWidth, this.container.clientHeight);
    }

    saveCameraState(camera, controls) {
        const state = { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), target: controls.target.toArray() };
        localStorage.setItem('roof_camera_view', JSON.stringify(state));
    }

    loadCameraState(camera, controls) {
        const saved = localStorage.getItem('roof_camera_view');
        if (saved) {
            const state = JSON.parse(saved);
            camera.position.fromArray(state.position);
            camera.quaternion.fromArray(state.quaternion);
            if (controls) {
                controls.target.fromArray(state.target);
                controls.update();
            }
        }
    }

    onWindowResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.draw();
    }
}