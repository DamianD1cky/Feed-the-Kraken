// 第一人称 · seated at the table: the camera where your eyes are, the cabin floor below the table,
// your identity card at your left, and the confirm slip that rides beside whatever you are about to commit.
// Prototype only: table-3d.html?fp and round-table.html.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Where you sit at the straight-edged slab of table-3d.html. Units are about 5 cm: the floor lies
 * 75 cm below the table top, and your eyes are 43 cm above it.
 */
export const SLAB_SEAT = {
    fov: 40,
    seated: { pos: V(0.15, 8.6, 10.9), look: V(-0.45, 0, 1.0) },
    slab: { width: 26, depth: 13.6, nearEdge: 5.15 },
    floor: { y: -15, z: 8 },
    dossier: { at: V(-2.0, 0.02, 3.55), yaw: 0.12 },
};

/**
 * Seats you at the table described by `seat` (SLAB_SEAT unless the page brings its own table).
 * `table` is the endless walnut plane of table-3d.html: a slab replaces it, and its grain floors the cabin.
 */
export function firstPerson({ scene, camera, home, look, table, floorMap: grain, hand: cards, dossier, dossierSeal, seat: L = SLAB_SEAT }) {
    home.copy(L.seated.pos);
    look.copy(L.seated.look);

    if (L.slab && table) {
        // A real slab of walnut with a near edge, instead of an endless plane.
        const { width, depth, nearEdge } = L.slab;
        const slab = new THREE.Mesh(new RoundedBoxGeometry(width, 0.7, depth, 4, 0.22), table.material);
        slab.position.set(0, -0.35, nearEdge - depth / 2);
        slab.receiveShadow = true;
        scene.add(slab);
        table.visible = false;
    }

    // Below the table: the cabin floor.
    const floorMap = (grain ?? table.material.map).clone();
    floorMap.repeat.set(2.4, 2.4);
    floorMap.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 40), new THREE.MeshStandardMaterial({ map: floorMap, color: 0x6d5a48, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, L.floor.y, L.floor.z);
    floor.receiveShadow = true;
    scene.add(floor);

    // Your identity card lies face down at your left.
    dossier.position.copy(L.dossier.at);
    dossier.rotation.y = L.dossier.yaw;
    dossierSeal?.position.copy(L.dossier.at).add(V(0, 0.015, 0.05));

    // The confirm slip: a scrap of paper beside the card you have picked.
    const slip = document.createElement("div");
    slip.className = "confirm-slip parchment";
    slip.innerHTML = `<span class="eyebrow">YOUR MOVE · 领航抉择</span><button class="btn-brass brass">执行这条航线 <span aria-hidden="true">→</span></button><button class="btn-quiet">跳船抗命…</button>`;
    document.body.append(slip);
    document.body.dataset.fp = "";

    const anchor = new THREE.Vector3();
    return {
        fov: L.fov,
        /** Every frame: the slip follows the chosen card. */
        update() {
            const chosen = cards.find((c) => c.chosen);
            chosen.mesh.updateMatrixWorld(true);
            anchor.set(0, 0.02, -0.68).applyMatrix4(chosen.mesh.matrixWorld).project(camera);
            const x = ((anchor.x + 1) / 2) * innerWidth;
            const y = ((1 - anchor.y) / 2) * innerHeight;
            slip.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) translateY(-14px) rotate(-1.2deg)`;
        },
    };
}
