import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BEZEL_R, BEZEL_TOP, CHART, CHART_PX, CHART_Y, DISC_R, PLAQUE_AT } from "./layout";
import { bezelTexture, canvasTexture, glowTexture, makeCanvas, rng, sealFace, shadowTexture, woodTexture } from "./paint";

/** Everything a table builds, so leaving the room frees it in one call. */
export class Kit {
    private owned: Array<{ dispose(): void }> = [];
    readonly rand = rng(4242);
    readonly glow: THREE.Texture;
    readonly shadow: THREE.Texture;
    readonly brass: THREE.MeshStandardMaterial;
    readonly brassPlain: THREE.MeshStandardMaterial;
    readonly cardEdge: THREE.MeshStandardMaterial;
    readonly cardGeo: THREE.BufferGeometry;

    constructor() {
        this.glow = this.own(glowTexture());
        this.shadow = this.own(shadowTexture());
        const brassTex = this.own(bezelTexture());
        this.brass = this.own(new THREE.MeshStandardMaterial({ map: brassTex, bumpMap: brassTex, bumpScale: 0.8, metalness: 0.92, roughness: 0.33 }));
        this.brassPlain = this.own(new THREE.MeshStandardMaterial({ color: 0xb48d3c, metalness: 0.95, roughness: 0.35 }));
        this.cardEdge = this.own(new THREE.MeshStandardMaterial({ color: 0xd9c38f, roughness: 0.7 }));
        this.cardGeo = this.own(new RoundedBoxGeometry(1.28, 0.025, 1.28, 2, 0.05));
    }

    own<T extends { dispose(): void }>(thing: T): T {
        this.owned.push(thing);
        return thing;
    }

    dispose() {
        for (const thing of this.owned) thing.dispose();
        this.owned = [];
    }
}

export function buildTable(kit: Kit) {
    const map = kit.own(woodTexture());
    const table = new THREE.Mesh(kit.own(new THREE.PlaneGeometry(26, 16)), kit.own(new THREE.MeshStandardMaterial({ map, roughness: 0.6 })));
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    return table;
}

export function buildChart(kit: Kit) {
    const [canvas, ctx] = makeCanvas(CHART_PX);
    const texture = kit.own(canvasTexture(canvas));
    const disc = new THREE.Mesh(kit.own(new THREE.CircleGeometry(DISC_R, 180)), kit.own(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.93 })));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(CHART.x, CHART_Y, CHART.z);
    disc.receiveShadow = true;
    return { disc, ctx, texture };
}

export function buildBezel(kit: Kit) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(kit.own(new THREE.RingGeometry(DISC_R, BEZEL_R, 200, 1)), kit.brass);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(CHART.x, BEZEL_TOP, CHART.z);
    ring.receiveShadow = true;
    const outer = new THREE.Mesh(kit.own(new THREE.CylinderGeometry(BEZEL_R, BEZEL_R + 0.03, BEZEL_TOP, 200, 1, true)), kit.brassPlain);
    outer.position.set(CHART.x, BEZEL_TOP / 2, CHART.z);
    outer.castShadow = true;
    const innerMat = kit.own(new THREE.MeshStandardMaterial({ color: 0x6b5121, metalness: 0.9, roughness: 0.45, side: THREE.BackSide }));
    const inner = new THREE.Mesh(kit.own(new THREE.CylinderGeometry(DISC_R, DISC_R, BEZEL_TOP - CHART_Y, 200, 1, true)), innerMat);
    inner.position.set(CHART.x, CHART_Y + (BEZEL_TOP - CHART_Y) / 2, CHART.z);
    group.add(ring, outer, inner);
    return group;
}

// Pressed wax never sets round: the body and its face share one wobbling outline.
function blob(geometry: THREE.BufferGeometry, angleOf: (x: number, y: number, z: number) => number, phases: number[], flat: boolean) {
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const a = angleOf(x, y, z);
        const k = 1 + 0.045 * Math.sin(3 * a + phases[0]!) + 0.03 * Math.sin(5 * a + phases[1]!) + 0.018 * Math.sin(9 * a + phases[2]!);
        position.setX(i, x * k);
        if (flat) position.setY(i, y * k);
        else position.setZ(i, z * k);
    }
    geometry.computeVertexNormals();
    return geometry;
}

export type Seal = THREE.Group & { userData: { face: THREE.MeshPhysicalMaterial; body: THREE.MeshPhysicalMaterial; label: string; dim: boolean } };

export function waxSeal(kit: Kit, label: string, { dim = false, radius = 0.27 } = {}): Seal {
    const group = new THREE.Group() as Seal;
    const phases = [kit.rand(), kit.rand(), kit.rand()].map((v) => v * Math.PI * 2);
    const bodyMat = kit.own(new THREE.MeshPhysicalMaterial({ color: dim ? 0x58524e : 0x7c1915, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 }));
    const body = new THREE.Mesh(kit.own(blob(new THREE.CylinderGeometry(radius, radius * 1.1, 0.08, 48), (x, _y, z) => Math.atan2(z, x), phases, false)), bodyMat);
    body.position.y = 0.04;
    body.castShadow = true;
    const face = kit.own(sealFace(label, dim));
    const faceMat = kit.own(new THREE.MeshPhysicalMaterial({ map: face, bumpMap: face, bumpScale: 1.6, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.25 }));
    const top = new THREE.Mesh(kit.own(blob(new THREE.CircleGeometry(radius, 48), (x, y) => Math.atan2(-y, x), phases, true)), faceMat);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.081;
    group.add(body, top);
    group.scale.set(1 + (kit.rand() - 0.5) * 0.06, 1, 1 + (kit.rand() - 0.5) * 0.06);
    group.userData = { face: faceMat, body: bodyMat, label, dim };
    return group;
}

/** Re-presses a seal's face, e.g. grey once its player has left the ship. */
export function restampSeal(kit: Kit, seal: Seal, label: string, dim: boolean) {
    if (seal.userData.label === label && seal.userData.dim === dim) return;
    const face = kit.own(sealFace(label, dim));
    seal.userData.face.map = face;
    seal.userData.face.bumpMap = face;
    seal.userData.face.needsUpdate = true;
    seal.userData.body.color.set(dim ? 0x58524e : 0x7c1915);
    seal.userData.label = label;
    seal.userData.dim = dim;
}

export type Card = THREE.Mesh & { userData: { face: THREE.MeshStandardMaterial; back: THREE.MeshStandardMaterial } };

/** A card with a printed face on top and its back beneath; turn it over by rotating about z. */
export function cardMesh(kit: Kit, face: THREE.Texture | undefined, back: THREE.Texture | undefined, { w = 1, d = 1 } = {}): Card {
    const faceMat = kit.own(new THREE.MeshStandardMaterial({ map: face ?? null, color: face ? 0xffffff : 0x3a2214, roughness: 0.55 }));
    const backMat = kit.own(new THREE.MeshStandardMaterial({ map: back ?? null, color: back ? 0xffffff : 0x3a2214, roughness: 0.6 }));
    const mesh = new THREE.Mesh(kit.cardGeo, [kit.cardEdge, kit.cardEdge, faceMat, backMat, kit.cardEdge, kit.cardEdge]) as unknown as Card;
    mesh.scale.set(w, 1, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { face: faceMat, back: backMat };
    return mesh;
}

export function setCardFace(card: Card, face: THREE.Texture) {
    card.userData.face.map = face;
    card.userData.face.color.set(0xffffff);
    card.userData.face.needsUpdate = true;
}

/** The navigator has no carved badge: a brass coin stamped with the compass. */
export function compassCoin(kit: Kit, face: THREE.Texture) {
    const coin = new THREE.Group();
    const rim = new THREE.Mesh(kit.own(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 40)), kit.brassPlain);
    rim.position.y = 0.025;
    const top = new THREE.Mesh(kit.own(new THREE.CircleGeometry(0.21, 40)), kit.own(new THREE.MeshStandardMaterial({ map: face, metalness: 0.5, roughness: 0.4 })));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.051;
    coin.add(rim, top);
    coin.traverse((o) => (o.castShadow = true));
    return coin;
}

/** A map order lifted off the chart: a thin parchment roundel. */
export function markerToken(kit: Kit, face: THREE.Texture) {
    const token = new THREE.Group();
    const paper = kit.own(new THREE.MeshStandardMaterial({ color: 0xe9d9b4, roughness: 0.8 }));
    const disc = new THREE.Mesh(kit.own(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 32)), paper);
    const top = new THREE.Mesh(kit.own(new THREE.CircleGeometry(0.2, 32)), kit.own(new THREE.MeshStandardMaterial({ map: face, roughness: 0.8, transparent: true })));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.011;
    token.add(disc, top);
    token.traverse((o) => (o.castShadow = true));
    return token;
}

export function buildPlaque(kit: Kit) {
    const [canvas, ctx] = makeCanvas(1024, 224);
    const texture = kit.own(canvasTexture(canvas));
    const face = kit.own(new THREE.MeshStandardMaterial({ map: texture, metalness: 0.75, roughness: 0.35 }));
    const p = kit.brassPlain;
    const plaque = new THREE.Mesh(kit.own(new RoundedBoxGeometry(2.9, 0.07, 0.64, 2, 0.03)), [p, p, face, p, p, p]);
    plaque.position.copy(PLAQUE_AT);
    plaque.castShadow = true;
    return { plaque, ctx, texture };
}

function page(kit: Kit, texture: THREE.Texture, side: "left" | "right") {
    const geo = new THREE.PlaneGeometry(2.2, 3.0, 24, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const t = side === "left" ? (x + 1.1) / 2.2 : (1.1 - x) / 2.2;
        pos.setZ(i, Math.sin(Math.min(1, (1 - t) * 1.4) * Math.PI * 0.5) * 0.09 + (1 - t) * 0.02);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(kit.own(geo), kit.own(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.88 })));
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
}

export function buildBook(kit: Kit) {
    const [leftCanvas, left] = makeCanvas(1024, 1400);
    const [rightCanvas, right] = makeCanvas(1024, 1400);
    const leftTex = kit.own(canvasTexture(leftCanvas));
    const rightTex = kit.own(canvasTexture(rightCanvas));
    const book = new THREE.Group();
    const cover = new THREE.Mesh(kit.own(new RoundedBoxGeometry(4.75, 0.12, 3.25, 3, 0.05)), kit.own(new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.55 })));
    cover.position.y = 0.06;
    cover.castShadow = true;
    const lp = page(kit, leftTex, "left");
    lp.position.set(-1.12, 0.14, 0);
    const rp = page(kit, rightTex, "right");
    rp.position.set(1.12, 0.14, 0);
    book.add(cover, lp, rp);
    return { book, left, right, leftTex, rightTex };
}

export function glowPlane(kit: Kit, size: number, color = 0xffc77a) {
    const glow = new THREE.Mesh(
        kit.own(new THREE.PlaneGeometry(size, size)),
        kit.own(new THREE.MeshBasicMaterial({ map: kit.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    glow.rotation.x = -Math.PI / 2;
    return glow;
}

export function contactShadow(kit: Kit, w: number, d: number) {
    const m = new THREE.Mesh(kit.own(new THREE.PlaneGeometry(w, d)), kit.own(new THREE.MeshBasicMaterial({ map: kit.shadow, transparent: true, depthWrite: false })));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.004;
    return m;
}

/** The ring of light a landing ship sends across the chart. */
export function rippleRing(kit: Kit) {
    const ring = new THREE.Mesh(
        kit.own(new THREE.RingGeometry(0.86, 1, 64)),
        kit.own(new THREE.MeshBasicMaterial({ color: 0xfff1cf, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    return ring;
}
