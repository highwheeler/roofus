import * as THREE from 'three';
import { Board } from './Board.js';
import { RidgeModule } from './RidgeModule.js';
import { HipModule } from './HipModule.js';
import { KingModule } from './KingModule.js';
import { FieldModule } from './FieldModule.js';
import { SheathingModule } from './SheathingModule.js';
import { FasciaModule } from './FasciaModule.js';
import { SoffitModule } from './SoffitModule.js';
import { PostModule } from './PostModule.js';
import { ShingleModule } from './ShingleModule.js';
import { SupportingBeamModule } from './SupportingBeamModule.js';
import { KneeBraceModule } from './KneeBraceModule.js';
import { DrillModule } from './DrillModule.js';

/**
 * ROOF GENERATOR v23.2
 * [2026-03-10] Always generates whole files.
 * UPDATED: Added DrillModule integration for knee brace thru-bolt visualization.
 */
export class RoofGenerator {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.scene.add(this.group);
        
        this.solids = [];
        this.lines = [];
        this.lastShapes = null;
        
        this.flags = {
            rafters: true,
            sheathing: true,
            shingles: true,
            fascia: true,
            soffit: true,
            posts: true
        };

        this.mats = {
            lumber: new THREE.MeshStandardMaterial({ color: 0xd2b48c, flatShading: true, side: THREE.DoubleSide }),
            ridge: new THREE.MeshStandardMaterial({ color: 0x8b4513, flatShading: true, side: THREE.DoubleSide }),
            beam: new THREE.MeshStandardMaterial({ color: 0xaaaaee, flatShading: true, side: THREE.DoubleSide }),
            sheathing: new THREE.MeshStandardMaterial({ 
                color: 0xcd853f, 
                flatShading: true, 
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -1, 
                polygonOffsetUnits: -4,
                roughness: 0.8
            }),
            shingle: new THREE.MeshStandardMaterial({ color: 0x333333, flatShading: true }),
            fascia: new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }),
            soffit: new THREE.MeshStandardMaterial({ color: 0xeeeeee, flatShading: true }),
            post: new THREE.MeshStandardMaterial({ 
                color: 0x5d4037, 
                flatShading: true,
                side: THREE.DoubleSide
            }),
            drill: new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
        };

        window.addEventListener('visibilityChanged', (e) => {
            const { layer, visible } = e.detail;
            if (this.flags.hasOwnProperty(layer)) {
                this.flags[layer] = visible;
                if (this.lastShapes) this.generate(this.lastShapes);
            }
        });

        window.addEventListener('paramsChanged', () => {
            if (this.lastShapes) {
                this.generate(this.lastShapes);
            }
        });
    }

    generate(shapes) {
        this.lastShapes = shapes;
        this.clear();

        shapes.forEach(shape => {
            let pts = [...shape.points];
            let area = 0;
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                area += pts[i].x * pts[j].y;
                area -= pts[j].x * pts[i].y;
            }
            if (area > 0) pts.reverse();

            const p = shape.params || {};
            const postHeight = parseFloat(p.postHeight || 96);
            const postThickness = parseFloat(p.postThickness || 6);
            const beamThickness = parseFloat(p.beamThickness);
            const beamDepth = parseFloat(p.beamDepth);
            const overhang = parseFloat(p.overhang || 0);
            
            const slope = p.slope !== undefined ? parseFloat(p.slope) : (parseFloat(p.pitch || 4) / 12);
            
            const rafterSpacing = parseFloat(p.rafterSpacing || 24);

            const sizeMap = {
                "2x4": 3.5, "2x6": 5.5, "2x8": 7.25, "2x10": 9.25, "2x12": 11.25
            };
            const rafterDepth = sizeMap[p.rafterSize] || 7.25;

            const slopeFactor = Math.sqrt(1 + Math.pow(slope, 2));
            const hapOffset = rafterDepth * slopeFactor; 

            const wallPts = pts.map(pt => ({ x: pt.x, y: postHeight, z: pt.y }));
            
            const xs = wallPts.map(pt => pt.x), zs = wallPts.map(pt => pt.z);
            const sizeX = Math.max(...xs) - Math.min(...xs);
            const sizeZ = Math.max(...zs) - Math.min(...zs);
            const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
            const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;

            const wallRun = Math.min(sizeX, sizeZ) / 2;
            const ridgeY = postHeight + (wallRun * slope) + hapOffset;
            const overhangY = postHeight + hapOffset - (overhang * slope);

            const halfRidgeLen = (Math.max(sizeX, sizeZ) / 2) - wallRun;
            let r1, r2;
            if (sizeX > sizeZ) {
                r1 = { x: centerX - halfRidgeLen, y: ridgeY, z: centerZ };
                r2 = { x: centerX + halfRidgeLen, y: ridgeY, z: centerZ };
            } else {
                r1 = { x: centerX, y: ridgeY, z: centerZ - halfRidgeLen };
                r2 = { x: centerX, y: ridgeY, z: centerZ + halfRidgeLen };
            }

            const oPts = (overhang === 0) 
                ? wallPts.map(pt => ({ ...pt, y: overhangY })) 
                : this.offsetPointsJS(wallPts, overhang).map(pt => ({ ...pt, y: overhangY }));

            const config = {
                thick: 1.5,
                beamThickness: beamThickness,
                beamDepth: beamDepth,
                rafterDepth: rafterDepth,
                ridgeDepth: rafterDepth,
                ridgeThickness: 2.5,
                sheathingThickness: 0.5,
                shingleThickness: 0.2,
                fasciaDepth: rafterDepth,
                fasciaThick: 0.75,
                postHeight,
                postThickness,
                braceThickness: parseFloat(p.braceThickness || 3.5),
                braceWidth: parseFloat(p.braceWidth || 5.5),
                braceOffset: parseFloat(p.braceOffset || 12),
                drillDiameter: parseFloat(p.drillDiameter || 0.625),
                slope, overhang, hapOffset, wallRun, overhangY, rafterSpacing
            };

            // 1. Framing
            if (this.flags.rafters) {
                this.renderModule(RidgeModule.create(r1, r2, config), this.mats.ridge, "Ridge", slope);
                this.renderModule(HipModule.create(oPts, r1, r2, config), this.mats.lumber, "Hip/Valley", slope);
                this.renderModule(KingModule.create(oPts, r1, r2, config), this.mats.lumber, "King Common", slope);
                this.renderModule(FieldModule.create(oPts, r1, r2, config), this.mats.lumber, "Common Rafter", slope);
            }

            // 2. Posts, Beams & Braces
            if (this.flags.posts) {
                this.renderModule(PostModule.create(wallPts, config), this.mats.post, "Post", 0);
                this.renderModule(SupportingBeamModule.create(wallPts, config), this.mats.beam, "Header", slope);
                
                const braceData = KneeBraceModule.create(wallPts, config);
                this.renderModule(braceData, this.mats.lumber, "Knee Brace", 0);

                // Add Drill Holes for Knee Braces
                if (braceData && braceData.boards) {
                    braceData.boards.forEach(braceBoard => {
                        const hole = DrillModule.createKneeBraceHole(braceBoard, config);
                        if (hole) {
                            const drillMesh = DrillModule.getVisualMesh(hole);
                            this.group.add(drillMesh);
                            this.solids.push(drillMesh);
                        }
                    });
                }
            }

            // 3. Fascia & Soffit
            if (this.flags.fascia) {
                this.renderModule(FasciaModule.create(oPts, config), this.mats.fascia, "Fascia", 0);
            }
            if (this.flags.soffit) {
                this.renderModule(SoffitModule.create(wallPts, oPts, config), this.mats.soffit, "Soffit", 0);
            }

            // 4. Sheathing & Shingles
            if (this.flags.sheathing) {
                this.renderModule(SheathingModule.create(oPts, r1, r2, config), this.mats.sheathing, "Sheathing", slope, true);
            }
            if (this.flags.shingles) {
                this.renderModule(ShingleModule.create(oPts, r1, r2, config), this.mats.shingle, "Shingles", slope);
            }
        });
    }

    renderModule(data, mat, type = "Member", slope = 0, isSheathing = false) {
        if (!data) return;
        const boards = data.boards || (Array.isArray(data) ? data : null);
        if (!boards) return;

        boards.forEach((bData, idx) => {
            const board = new Board(bData.id, bData.vertices);
            const positions = board.getGeometryData();
            if (positions.length === 0) return;
            let geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo = geo.toNonIndexed(); 
            geo.computeVertexNormals();
            const mesh = new THREE.Mesh(geo, mat);

            mesh.userData = { 
                ...(bData.userData || {}), 
                id: bData.id || `${type}_${idx}`, 
                memberType: type, 
                slope: slope, 
                isSheathing: isSheathing 
            };
            
            mesh.renderOrder = (isSheathing || type === "Shingles") ? 10 : 1;
            this.group.add(mesh);
            this.solids.push(mesh);
        });
    }

    offsetPointsJS(pts, d) {
        const res = [];
        for (let i = 0; i < pts.length; i++) {
            const p = pts[(i + pts.length - 1) % pts.length];
            const c = pts[i];
            const n = pts[(i + 1) % pts.length];
            const v1 = { x: c.x - p.x, z: c.z - p.z };
            const v1Mag = Math.hypot(v1.x, v1.z);
            v1.x /= v1Mag; v1.z /= v1Mag;
            const v2 = { x: n.x - c.x, z: n.z - c.z };
            const v2Mag = Math.hypot(v2.x, v2.z);
            v2.x /= v2Mag; v2.z /= v2Mag;
            const n1 = { x: -v1.z, z: v1.x };
            const n2 = { x: -v2.z, z: v2.x };
            const m = { x: n1.x + n2.x, z: n1.z + n2.z };
            const mMag = Math.hypot(m.x, m.z);
            m.x /= mMag; m.z /= mMag;
            const dot = m.x * n1.x + m.z * n1.z;
            const length = d / dot;
            res.push({ x: c.x + m.x * length, y: c.y, z: c.z + m.z * length });
        }
        return res;
    }

    clear() {
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            if (child.geometry) child.geometry.dispose();
            this.group.remove(child);
        }
        this.solids = [];
        this.lines = [];
    }
}