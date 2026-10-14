// 海图桌 · a 3D sketch of the table seen from your seat. Prototype only.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { hexCells } from "./kit.js";

// ── the moment on the table (same as chart-table.html) ─────────────────────────────
const players = [
    { seat: 1, name: "老约翰", guns: 3 },
    { seat: 2, name: "灰鸥", guns: 3, muted: true, offDuty: true },
    { seat: 3, name: "铁锚", guns: 3, office: "captain" },
    { seat: 4, name: "瞎眼汤姆", guns: 2 },
    {
        seat: 5,
        name: "Dean",
        guns: 3,
        office: "navigator",
        me: true,
        turn: true,
    },
    { seat: 6, name: "红胡子", guns: 3, notPirate: true },
    { seat: 7, name: "小雀", guns: 3, office: "firstMate" },
    { seat: 8, name: "盐巴", guns: 3, dead: true },
    { seat: 9, name: "雾笛", guns: 3, offDuty: true },
];
const CHART = new THREE.Vector3(-1.9, 0, -0.55);
const DISC_R = 3.0;
const BEZEL_R = 3.55;
const BEZEL_TOP = 0.13;
const SEAT_R = 3.28;
const HEX_U = 0.44;
const PX_PER_U = 1024 / DISC_R;

const loadImage = (src) =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
const art = Object.fromEntries(
    await Promise.all(
        [
            "id-pirate",
            "id-sailor",
            "id-cult",
            "detect",
            "lash",
            "compass",
            "card-east",
            "card-north",
            "card-west",
            "secret",
        ].map(async (k) => [k, await loadImage(`/art/${k}.webp`)]),
    ),
);
await Promise.all(
    [
        '40px "Songti SC"',
        '40px "Kaiti SC"',
        '40px "Copperplate"',
        'italic 40px "Hoefler Text"',
        '40px "Didot"',
    ].map((f) => document.fonts.load(f)),
);

const HAND = '"Kaiti SC", "STKaiti", KaiTi, serif';
const PRINT = '"Songti SC", "STSong", serif';
const PLAQUE = 'Copperplate, "Copperplate Gothic Light", serif';
const LATIN = '"Hoefler Text", "Big Caslon", Georgia, serif';
const NUMERAL = 'Didot, "Bodoni 72", serif';

// ── renderer, scene, camera ─────────────────────────────────────────────────
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090604);
scene.fog = new THREE.Fog(0x090604, 15, 30);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(
    new RoomEnvironment(),
    0.04,
).texture;
scene.environmentIntensity = 0.22;

const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 60);
const HOME = new THREE.Vector3(0.3, 10.6, 10.2);
const LOOK = new THREE.Vector3(0.3, 0, 0.75);
camera.position.copy(HOME);
camera.lookAt(LOOK);

const hemi = new THREE.HemisphereLight(0x6e7d96, 0x1a1009, 0.28);
scene.add(hemi);
const lantern = new THREE.SpotLight(0xffd29a, 320, 48, 0.44, 0.95, 1.7);
lantern.position.set(7.5, 14.5, 5.5);
lantern.target.position.set(-0.6, 0, -0.2);
lantern.castShadow = true;
lantern.shadow.mapSize.set(2048, 2048);
lantern.shadow.bias = -0.0003;
lantern.shadow.normalBias = 0.02;
scene.add(lantern, lantern.target);

const canvasTexture = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
};
const makeCanvas = (w, h = w) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return [c, c.getContext("2d")];
};
const rand = (() => {
    let s = 20261013;
    return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 4294967296;
    };
})();
function speckle(ctx, w, h, amount) {
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
        const n = (rand() - 0.5) * amount;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
}

// ── the table: dark walnut planks ─────────────────────────────────────────────
function woodTexture() {
    const [c, g] = makeCanvas(2048, 1024);
    const planks = 6;
    const ph = 1024 / planks;
    for (let p = 0; p < planks; p++) {
        const y0 = p * ph;
        const tone = 30 + rand() * 10;
        g.fillStyle = `rgb(${tone + 14}, ${tone - 2}, ${tone - 14})`;
        g.fillRect(0, y0, 2048, ph);
        for (let i = 0; i < 150; i++) {
            const y = y0 + rand() * ph;
            const amp = 2 + rand() * 6;
            const freq = 0.002 + rand() * 0.004;
            const phase = rand() * 10;
            g.beginPath();
            for (let x = 0; x <= 2048; x += 16)
                g.lineTo(
                    x,
                    y +
                        Math.sin(x * freq + phase) * amp +
                        Math.sin(x * freq * 3.1 + phase) * amp * 0.3,
                );
            const dark = rand() < 0.7;
            g.strokeStyle = dark
                ? `rgba(12, 6, 2, ${0.08 + rand() * 0.14})`
                : `rgba(140, 92, 52, ${0.04 + rand() * 0.06})`;
            g.lineWidth = 0.6 + rand() * 2.2;
            g.stroke();
        }
        g.fillStyle = "rgba(0, 0, 0, 0.75)";
        g.fillRect(0, y0, 2048, 3);
        g.fillStyle = "rgba(255, 210, 160, 0.06)";
        g.fillRect(0, y0 + 3, 2048, 1);
    }
    speckle(g, 2048, 1024, 10);
    const t = canvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}
const table = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 16),
    new THREE.MeshStandardMaterial({
        map: woodTexture(),
        roughness: 0.6,
        metalness: 0,
    }),
);
table.rotation.x = -Math.PI / 2;
table.receiveShadow = true;
scene.add(table);

// ── the chart: a portolan on parchment, inked with the real hex layout ─────────────
const toCanvas = (x, y) => [1024 + x, 1024 + y];
const HEX = HEX_U * PX_PER_U;
const cells = hexCells(3, HEX);
const shiftY = Math.sqrt(3) * HEX * 2.5;
const cellAt = (key) => {
    const c = cells.find((cell) => cell.key === key);
    return [c.x, c.y + shiftY];
};
function hexPath(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        g[i ? "lineTo" : "moveTo"](x + r * Math.cos(a), y + r * Math.sin(a));
    }
    g.closePath();
}
function chartTexture() {
    const [c, g] = makeCanvas(2048);
    const bg = g.createRadialGradient(1024, 940, 120, 1024, 1024, 1024);
    bg.addColorStop(0, "#e9d7ac");
    bg.addColorStop(0.62, "#d6bd88");
    bg.addColorStop(0.9, "#b89863");
    bg.addColorStop(1, "#8f7040");
    g.fillStyle = bg;
    g.fillRect(0, 0, 2048, 2048);
    for (let i = 0; i < 26; i++) {
        const x = rand() * 2048;
        const y = rand() * 2048;
        const r = 60 + rand() * 260;
        const s = g.createRadialGradient(x, y, 0, x, y, r);
        s.addColorStop(0, `rgba(120, 82, 40, ${0.04 + rand() * 0.07})`);
        s.addColorStop(1, "rgba(120, 82, 40, 0)");
        g.fillStyle = s;
        g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(g, 2048, 2048, 14);
    for (const [ox, oy, n, alpha] of [
        [1024, 1024, 32, 0.2],
        [270, 1430, 16, 0.14],
        [1778, 1430, 16, 0.14],
    ]) {
        for (let i = 0; i < n; i++) {
            const a = (i * Math.PI * 2) / n;
            g.beginPath();
            g.moveTo(ox, oy);
            g.lineTo(ox + Math.cos(a) * 3000, oy + Math.sin(a) * 3000);
            g.strokeStyle = `rgba(90, 70, 46, ${alpha})`;
            g.lineWidth = 2;
            g.stroke();
        }
    }
    const wash = {
        pirate: "rgba(161, 65, 45, .6)",
        sailor: "rgba(60, 109, 145, .58)",
        cult: "rgba(181, 134, 40, .62)",
    };
    const emblem = {
        pirate: art["id-pirate"],
        sailor: art["id-sailor"],
        cult: art["id-cult"],
    };
    for (const cell of cells) {
        const [x, y] = toCanvas(cell.x, cell.y + shiftY);
        hexPath(g, x, y, HEX);
        if (cell.kind !== "water") {
            g.fillStyle = wash[cell.kind];
            g.fill();
        }
        g.strokeStyle =
            cell.kind === "water"
                ? "rgba(46, 33, 20, .72)"
                : "rgba(46, 33, 20, .6)";
        g.lineWidth = 4.6;
        g.stroke();
        if (cell.kind !== "water") {
            const img = emblem[cell.kind];
            const s = HEX * 0.95;
            const k = s / Math.max(img.width, img.height);
            g.globalAlpha = 0.92;
            g.drawImage(
                img,
                x - (img.width * k) / 2,
                y - (img.height * k) / 2,
                img.width * k,
                img.height * k,
            );
            g.globalAlpha = 1;
        }
    }
    const [sx, sy] = toCanvas(...cellAt("0:0"));
    g.save();
    g.translate(sx, sy);
    g.fillStyle = "rgba(90, 70, 46, .55)";
    g.beginPath();
    for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const r = i % 2 ? 22 : 78;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
    g.font = `40px ${HAND}`;
    g.textAlign = "center";
    g.fillStyle = "#3a2b1b";
    g.fillText("起点", 0, 122);
    g.restore();
    const markers = [
        ["0:2", art["id-cult"], "献祭"],
        ["1:1", art.detect, "搜查"],
        ["2:2", art.detect, "搜查"],
        ["-2:1", art.lash, "鞭笞"],
    ];
    for (const [key, icon, label] of markers) {
        const [x, y] = toCanvas(...cellAt(key));
        g.beginPath();
        g.arc(x, y - 16, 54, 0, Math.PI * 2);
        g.fillStyle = "rgba(244, 233, 206, .94)";
        g.fill();
        g.strokeStyle = "#3a2b1b";
        g.lineWidth = 3.5;
        g.stroke();
        const k = 74 / Math.max(icon.width, icon.height);
        g.drawImage(
            icon,
            x - (icon.width * k) / 2,
            y - 16 - (icon.height * k) / 2,
            icon.width * k,
            icon.height * k,
        );
        g.font = `38px ${HAND}`;
        g.textAlign = "center";
        g.fillStyle = "#3a2b1b";
        g.fillText(label, x, y + 88);
    }
    const route = ["0:0", "0:1", "-1:1"].map((key) => toCanvas(...cellAt(key)));
    g.setLineDash([2, 22]);
    g.lineCap = "round";
    g.lineWidth = 8;
    g.strokeStyle = "#3a2b1b";
    g.beginPath();
    route.forEach(([x, y], i) => g[i ? "lineTo" : "moveTo"](x, y));
    g.stroke();
    g.setLineDash([]);
    g.font = `italic 40px ${LATIN}`;
    g.fillStyle = "#3a2b1b";
    g.fillText("i", route[1][0] + 48, route[1][1] + 70);
    g.fillText("ii", route[2][0] - 74, route[2][1] + 84);
    const label = (text, latin, x, y, rot) => {
        g.save();
        g.translate(x, y);
        g.rotate(rot);
        g.textAlign = "center";
        g.font = `56px ${HAND}`;
        g.fillStyle = "#5d4931";
        g.fillText(text, 0, 0);
        g.font = `italic 34px ${LATIN}`;
        g.fillStyle = "#8a7357";
        g.fillText(latin, 0, 46);
        g.restore();
    };
    label("海盗湾", "Sinus Piratarum", 1024 - 640, 1024 - 640, -0.66);
    label("皇家航道", "Via Regia", 1024 + 640, 1024 - 640, 0.66);
    g.textAlign = "center";
    g.font = `48px ${HAND}`;
    g.fillStyle = "#5d4931";
    g.fillText("克拉肯之喉", 1024, 1024 - 905);
    g.font = `44px ${HAND}`;
    g.fillStyle = "#3a2b1b";
    g.fillText("— 领航员 Dean 正在决定航线 —", 1024, 1024 + 890);
    return canvasTexture(c);
}
const disc = new THREE.Mesh(
    new THREE.CircleGeometry(DISC_R, 180),
    new THREE.MeshStandardMaterial({ map: chartTexture(), roughness: 0.93 }),
);
disc.rotation.x = -Math.PI / 2;
disc.position.set(CHART.x, 0.07, CHART.z);
disc.receiveShadow = true;
scene.add(disc);
const chartPoint = (key) => {
    const [x, y] = cellAt(key);
    return new THREE.Vector3(
        CHART.x + x / PX_PER_U,
        0.07,
        CHART.z + y / PX_PER_U,
    );
};

// ── the brass bezel with engraved degrees ───────────────────────────────────────
function bezelTexture() {
    const [c, g] = makeCanvas(2048);
    const inner = (DISC_R / BEZEL_R) * 1024;
    const grad = g.createLinearGradient(0, 0, 2048, 2048);
    grad.addColorStop(0, "#f0d896");
    grad.addColorStop(0.35, "#bf9844");
    grad.addColorStop(0.55, "#e2c37a");
    grad.addColorStop(0.8, "#9b772b");
    grad.addColorStop(1, "#d6b466");
    g.fillStyle = grad;
    g.fillRect(0, 0, 2048, 2048);
    g.translate(1024, 1024);
    for (let d = 0; d < 360; d += 2) {
        const long = d % 30 === 0 ? 46 : d % 10 === 0 ? 28 : 14;
        const a = (d * Math.PI) / 180;
        g.beginPath();
        g.moveTo(Math.cos(a) * 1016, Math.sin(a) * 1016);
        g.lineTo(Math.cos(a) * (1016 - long), Math.sin(a) * (1016 - long));
        g.strokeStyle = "rgba(60, 42, 12, .85)";
        g.lineWidth = long > 14 ? 4 : 2.5;
        g.stroke();
    }
    for (const r of [inner + 4, inner + 70, 1020]) {
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.strokeStyle = "rgba(60, 42, 12, .7)";
        g.lineWidth = 3;
        g.stroke();
    }
    g.font = `52px ${PLAQUE}`;
    g.fillStyle = "rgba(60, 42, 12, .9)";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const [deg, text] of [
        [0, "E"],
        [180, "W"],
    ]) {
        const a = (deg * Math.PI) / 180;
        g.fillText(
            text,
            Math.cos(a) * (inner + 40),
            Math.sin(a) * (inner + 40),
        );
    }
    return canvasTexture(c);
}
const brassTex = bezelTexture();
const brass = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: brassTex,
    bumpMap: brassTex,
    bumpScale: 0.8,
    metalness: 0.92,
    roughness: 0.33,
});
const brassPlain = new THREE.MeshStandardMaterial({
    color: 0xb48d3c,
    metalness: 0.95,
    roughness: 0.35,
});
const ring = new THREE.Mesh(
    new THREE.RingGeometry(DISC_R, BEZEL_R, 200, 1),
    brass,
);
ring.rotation.x = -Math.PI / 2;
ring.position.set(CHART.x, BEZEL_TOP, CHART.z);
ring.receiveShadow = true;
const outerWall = new THREE.Mesh(
    new THREE.CylinderGeometry(
        BEZEL_R,
        BEZEL_R + 0.03,
        BEZEL_TOP,
        200,
        1,
        true,
    ),
    brassPlain,
);
outerWall.position.set(CHART.x, BEZEL_TOP / 2, CHART.z);
outerWall.castShadow = true;
const innerWall = new THREE.Mesh(
    new THREE.CylinderGeometry(DISC_R, DISC_R, BEZEL_TOP - 0.07, 200, 1, true),
    new THREE.MeshStandardMaterial({
        color: 0x6b5121,
        metalness: 0.9,
        roughness: 0.45,
        side: THREE.BackSide,
    }),
);
innerWall.position.set(CHART.x, 0.07 + (BEZEL_TOP - 0.07) / 2, CHART.z);
scene.add(ring, outerWall, innerWall);

// ── wax seals on the bezel, you at the near side ─────────────────────────────────
const viewerIndex = players.findIndex((p) => p.me);
const seatAngle = (i) =>
    ((90 +
        ((i - viewerIndex + players.length) % players.length) *
            (360 / players.length)) *
        Math.PI) /
    180;
const onRing = (angle, r, y = 0) =>
    new THREE.Vector3(
        CHART.x + Math.cos(angle) * r,
        y,
        CHART.z + Math.sin(angle) * r,
    );
function sealTop(label, dim) {
    const [c, g] = makeCanvas(256);
    const grad = g.createRadialGradient(100, 90, 10, 128, 128, 130);
    grad.addColorStop(0, dim ? "#a39a92" : "#d9604f");
    grad.addColorStop(0.5, dim ? "#666059" : "#982521");
    grad.addColorStop(1, dim ? "#3b3633" : "#561210");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    g.beginPath();
    g.arc(128, 128, 84, 0, Math.PI * 2);
    g.strokeStyle = "rgba(30, 4, 3, .5)";
    g.lineWidth = 7;
    g.stroke();
    g.beginPath();
    g.arc(125, 125, 84, 0, Math.PI * 2);
    g.strokeStyle = "rgba(255, 200, 180, .25)";
    g.lineWidth = 3;
    g.stroke();
    g.font = `112px ${NUMERAL}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(255, 196, 176, .3)";
    g.fillText(label, 124, 132);
    g.fillStyle = "rgba(48, 6, 4, .92)";
    g.fillText(label, 128, 136);
    return canvasTexture(c);
}
// Pressed wax never sets round: the body and its face share one wobbling outline.
function blob(geometry, angleOf, phases) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const z = position.getZ(i);
        const y = position.getY(i);
        const a = angleOf(x, y, z);
        const k =
            1 +
            0.045 * Math.sin(3 * a + phases[0]) +
            0.03 * Math.sin(5 * a + phases[1]) +
            0.018 * Math.sin(9 * a + phases[2]);
        position.setX(i, x * k);
        if (geometry.type === "CircleGeometry") position.setY(i, y * k);
        else position.setZ(i, z * k);
    }
    geometry.computeVertexNormals();
    return geometry;
}
function waxSeal(label, { dim = false, radius = 0.27 } = {}) {
    const group = new THREE.Group();
    const wax = new THREE.MeshPhysicalMaterial({
        color: dim ? 0x58524e : 0x7c1915,
        roughness: 0.42,
        clearcoat: 0.35,
        clearcoatRoughness: 0.3,
    });
    const phases = [rand(), rand(), rand()].map((v) => v * Math.PI * 2);
    const body = new THREE.Mesh(
        blob(
            new THREE.CylinderGeometry(radius, radius * 1.1, 0.08, 48),
            (x, _y, z) => Math.atan2(z, x),
            phases,
        ),
        wax,
    );
    body.position.y = 0.04;
    body.castShadow = true;
    const face = sealTop(label, dim);
    const top = new THREE.Mesh(
        blob(
            new THREE.CircleGeometry(radius, 48),
            (x, y) => Math.atan2(-y, x),
            phases,
        ),
        new THREE.MeshPhysicalMaterial({
            map: face,
            bumpMap: face,
            bumpScale: 1.6,
            roughness: 0.4,
            clearcoat: 0.4,
            clearcoatRoughness: 0.25,
        }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.081;
    group.add(body, top);
    group.scale.set(1 + (rand() - 0.5) * 0.06, 1, 1 + (rand() - 0.5) * 0.06);
    return group;
}
const seats = players.map((p, i) => {
    const angle = seatAngle(i);
    const seal = waxSeal(String(p.seat), {
        dim: p.dead,
        radius: p.me ? 0.31 : 0.27,
    });
    seal.position.copy(onRing(angle, SEAT_R, BEZEL_TOP));
    seal.rotation.y = (rand() - 0.5) * 0.25;
    scene.add(seal);
    return { player: p, angle, seal };
});

// The pointer at the edge of the chart, aimed at whoever must act.
const active = seats.find((s) => s.player.turn);
const pointer = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.34, 4),
    brassPlain,
);
pointer.rotation.z = -Math.PI / 2;
const pointerArm = new THREE.Group();
pointerArm.add(pointer);
pointer.position.x = DISC_R - 0.24;
pointerArm.position.set(CHART.x, 0.12, CHART.z);
pointerArm.rotation.y = -active.angle;
scene.add(pointerArm);
const glowTex = (() => {
    const [c, g] = makeCanvas(128);
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255, 214, 150, .9)");
    r.addColorStop(0.4, "rgba(255, 190, 110, .35)");
    r.addColorStop(1, "rgba(255, 190, 110, 0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return canvasTexture(c);
})();
// Light pooled on the brass under the seal, so the seal itself stays crisp.
const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0xffc77a,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    }),
);
glow.rotation.x = -Math.PI / 2;
glow.position.copy(active.seal.position).add(new THREE.Vector3(0, 0.006, 0));
scene.add(glow);

// ── models: the ship, the kraken's tentacle, office tokens, props that carry state ───────
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const shadowTex = (() => {
    const [c, g] = makeCanvas(128);
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(0,0,0,.65)");
    r.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
})();
function contactShadow(w, d) {
    const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({
            map: shadowTex,
            transparent: true,
            depthWrite: false,
        }),
    );
    m.rotation.x = -Math.PI / 2;
    return m;
}
/** Loads a model, sizes its largest dimension, sets it on the surface at `at`. */
async function place(
    file,
    { size, at, rotation = [0, 0, 0], shadow = true, y = 0 },
) {
    const root = (await loader.loadAsync(`/models/${file}.glb`)).scene;
    root.rotation.set(...rotation);
    root.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(root);
    const s = size / Math.max(...box.getSize(new THREE.Vector3()).toArray());
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.set(at.x - center.x, at.y + y - box.min.y, at.z - center.z);
    root.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = shadow;
            o.receiveShadow = true;
        }
    });
    scene.add(root);
    if (shadow) {
        const footprint = box.getSize(new THREE.Vector3());
        const cs = contactShadow(footprint.x * 1.3, footprint.z * 1.3);
        cs.position.set(at.x, at.y + 0.004, at.z);
        scene.add(cs);
    }
    return root;
}
const seatOf = (n) => seats.find((s) => s.player.seat === n);
// A seat's things lie in the gap beside its seal; straight outward is where its name slip goes.
const besideSeat = (n, along, out = 0.5) =>
    onRing(seatOf(n).angle + along, SEAT_R + out, 0);
const shipAt = chartPoint("-1:1");
const [, kraken] = await Promise.all([
    place("ship-sails", {
        size: 0.95,
        at: shipAt,
        rotation: [0, Math.PI / 2, 0],
    }),
    place("tentacle-small", {
        size: 0.62,
        at: chartPoint("0:5"),
        rotation: [0, -0.4, 0],
    }),
    place("candle", {
        size: 1.35,
        at: new THREE.Vector3(-6.2, 0, -3.3),
        rotation: [0, 0.6, 0],
    }),
    place("helm", {
        size: 0.62,
        at: besideSeat(3, 0.33),
        rotation: [-Math.PI / 2, 0, 0.3],
    }),
    place("mate-badge", {
        size: 0.52,
        at: besideSeat(7, -0.33),
        rotation: [-Math.PI / 2, 0, -0.2],
    }),
    place("off-duty", {
        size: 0.42,
        at: besideSeat(2, -0.33),
        rotation: [0, -0.5, 0],
    }),
    place("off-duty", {
        size: 0.42,
        at: besideSeat(9, -0.33),
        rotation: [0, 0.4, 0],
    }),
    place("knife", {
        size: 0.62,
        at: besideSeat(2, 0.27, 0.42),
        rotation: [0, 0.9, Math.PI / 2],
    }),
    place("pistol", {
        size: 1.15,
        at: new THREE.Vector3(-5.3, 0, 3.0),
        rotation: [0, 0.75, Math.PI / 2],
    }),
    place("magnifier", {
        size: 1.0,
        at: new THREE.Vector3(2.6, 0, -3.7),
        rotation: [0, 0.9, 0],
    }),
]);

// The navigator has no carved badge yet: a brass coin stamped with the compass.
const coin = new THREE.Group();
coin.add(
    new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 0.05, 40),
        brassPlain,
    ),
);
const coinFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.21, 40),
    new THREE.MeshStandardMaterial({
        map: (() => {
            const [c, g] = makeCanvas(256);
            g.fillStyle = "#c9a24b";
            g.fillRect(0, 0, 256, 256);
            const img = art.compass;
            const k = 210 / Math.max(img.width, img.height);
            g.drawImage(
                img,
                128 - (img.width * k) / 2,
                128 - (img.height * k) / 2,
                img.width * k,
                img.height * k,
            );
            return canvasTexture(c);
        })(),
        metalness: 0.5,
        roughness: 0.4,
    }),
);
coinFace.rotation.x = -Math.PI / 2;
coinFace.position.y = 0.026;
coin.add(coinFace);
coin.position
    .copy(besideSeat(5, 0.32, 0.56))
    .add(new THREE.Vector3(0, 0.025, 0));
coin.traverse((o) => (o.castShadow = true));
scene.add(coin);

// The candle's flame: a warm light that never quite holds still.
const flamePos = new THREE.Vector3(-6.15, 1.36, -3.32);
const candleLight = new THREE.PointLight(0xff9a48, 16, 11, 1.8);
candleLight.position.copy(flamePos);
scene.add(candleLight);
const flame = new THREE.Sprite(
    new THREE.SpriteMaterial({
        map: glowTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    }),
);
flame.scale.set(0.55, 0.75, 1);
flame.position.copy(flamePos);
scene.add(flame);

// ── cards in front of you ───────────────────────────────────────────────────
function cardTexture(face, title, hint) {
    const [c, g] = makeCanvas(1024);
    g.drawImage(face, 0, 0, 1024, 1024);
    if (title) {
        g.font = `bold 76px ${PRINT}`;
        const w = Math.max(g.measureText(title).width, 360) + 90;
        const grad = g.createLinearGradient(0, 80, 0, 260);
        grad.addColorStop(0, "#f3e5c2");
        grad.addColorStop(1, "#d3b983");
        g.fillStyle = grad;
        g.shadowColor = "rgba(0,0,0,.45)";
        g.shadowBlur = 18;
        g.fillRect(512 - w / 2, 92, w, 160);
        g.shadowBlur = 0;
        g.fillStyle = "#2a1c0d";
        g.textAlign = "center";
        g.fillText(title, 512, 182);
        g.font = `38px ${PRINT}`;
        g.globalAlpha = 0.75;
        g.fillText(hint, 512, 232);
        g.globalAlpha = 1;
    }
    return canvasTexture(c);
}
const cardGeo = new RoundedBoxGeometry(1.28, 0.025, 1.28, 2, 0.05);
function card(texture, { w = 1, d = 1 } = {}) {
    const edge = new THREE.MeshStandardMaterial({
        color: 0xd9c38f,
        roughness: 0.7,
    });
    const face = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.55,
    });
    const mesh = new THREE.Mesh(cardGeo, [edge, edge, face, edge, edge, edge]);
    mesh.scale.set(w, 1, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}
const hand = [
    {
        mesh: card(cardTexture(art["card-east"], "醉酒", "船长职务按简历轮换")),
        at: new THREE.Vector3(0.75, 0.02, 3.9),
        yaw: 0.1,
    },
    {
        mesh: card(
            cardTexture(art["card-north"], "邪教起义", "翻开一张邪教仪式"),
        ),
        at: new THREE.Vector3(2.2, 0.02, 3.82),
        yaw: -0.06,
        chosen: true,
    },
];
for (const h of hand) {
    h.mesh.position.copy(h.at);
    h.mesh.rotation.y = h.yaw;
    h.lift = h.chosen ? 1 : 0;
    scene.add(h.mesh);
}
const highlight = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0xffc77a,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    }),
);
highlight.rotation.x = -Math.PI / 2;
scene.add(highlight);
const dossier = card(
    canvasTexture(
        (() => {
            const [c, g] = makeCanvas(768, 1024);
            g.drawImage(art.secret, -128, 0, 1024, 1024);
            return c;
        })(),
    ),
    { w: 0.78, d: 1.04 },
);
dossier.position.set(-0.6, 0.02, 4.0);
dossier.rotation.y = 0.16;
scene.add(dossier);
const dossierSeal = waxSeal("密", { radius: 0.2 });
dossierSeal.position.set(-0.6, 0.035, 4.05);
scene.add(dossierSeal);

// ── the logbook, lying open to the right ────────────────────────────────────────
function pageTexture(draw) {
    const [c, g] = makeCanvas(1024, 1400);
    const bg = g.createLinearGradient(0, 0, 1024, 0);
    bg.addColorStop(0, "#e9d8b0");
    bg.addColorStop(1, "#dcc496");
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 1400);
    speckle(g, 1024, 1400, 12);
    g.fillStyle = "#2a2016";
    draw(g);
    return canvasTexture(c);
}
const dot = (g, n, x, y) => {
    g.beginPath();
    g.arc(x, y - 14, 20, 0, Math.PI * 2);
    g.fillStyle = "#8a211c";
    g.fill();
    g.fillStyle = "#fbe6dc";
    g.font = `26px ${NUMERAL}`;
    g.textAlign = "center";
    g.fillText(String(n), x, y - 5);
    g.textAlign = "left";
};
const leftPage = pageTexture((g) => {
    g.font = `bold 78px ${PRINT}`;
    g.fillText("航海日志", 80, 150);
    g.font = `italic 44px ${LATIN}`;
    g.fillStyle = "#6b5640";
    g.fillText("Ship's Log · iii", 640, 146);
    g.fillRect(80, 186, 864, 3);
    const rounds = [
        ["i", [3, 1, 4], "叛变 0 枪 · 西 · 美人鱼", "献祭 ⑧"],
        ["ii", [3, 9, 2], "叛变 2 枪 · 败 · 北 · 邪教起义", "割舌 ②"],
        ["iii", [3, 7, 5], "叛变 1 枪 · 败 · 航线待揭晓", ""],
    ];
    const name = (n) => players.find((p) => p.seat === n).name;
    rounds.forEach(([r, crew, outcome, stamp], i) => {
        const y = 300 + i * 300;
        g.fillStyle = "#3a2b1b";
        g.font = `italic 64px ${LATIN}`;
        g.fillText(r, 84, y);
        crew.forEach((n, k) => {
            const x = 190 + k * 270;
            g.font = `32px ${PRINT}`;
            g.fillStyle = "#8a7357";
            g.fillText(["船长", "大副", "领航"][k], x, y - 54);
            dot(g, n, x + 20, y);
            g.font = `52px ${HAND}`;
            g.fillStyle = "#20170e";
            g.fillText(name(n), x + 54, y);
        });
        g.font = `44px ${HAND}`;
        g.fillStyle = "#3a2b1b";
        g.fillText(outcome, 190, y + 84);
        if (stamp) {
            g.save();
            g.translate(800, y + 70);
            g.rotate(-0.06);
            g.strokeStyle = "#ad3528";
            g.lineWidth = 5;
            g.strokeRect(-10, -50, 190, 70);
            g.font = `bold 44px ${PRINT}`;
            g.fillStyle = "#ad3528";
            g.fillText(stamp, 4, 2);
            g.restore();
        }
        g.fillStyle = "rgba(58, 43, 27, .25)";
        g.fillRect(80, y + 130, 864, 2);
    });
});
const rightPage = pageTexture((g) => {
    g.font = `40px ${PRINT}`;
    g.fillStyle = "#6b5640";
    g.fillText("今日条目 · 第三轮", 80, 150);
    const lines = [
        "叛变失败，只亮出 1 把枪，",
        "枪尽数收回。",
        "船长 铁锚 抽了 2 张航行牌，",
        "留 1 张入日志。",
        "大副 小雀 抽了 2 张，留 1 张。",
        "日志交到了领航员 Dean 手中 |",
    ];
    g.font = `58px ${HAND}`;
    g.fillStyle = "#2a2016";
    lines.forEach((line, i) => g.fillText(line, 80, 270 + i * 112));
    g.font = `30px ${PRINT}`;
    g.fillStyle = "#8a7357";
    g.fillText("公开记录 · 私密情报不会写进这本日志", 80, 1320);
});
function page(texture, side) {
    const geo = new THREE.PlaneGeometry(2.2, 3.0, 24, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const t = side === "left" ? (x + 1.1) / 2.2 : (1.1 - x) / 2.2;
        pos.setZ(
            i,
            Math.sin(Math.min(1, (1 - t) * 1.4) * Math.PI * 0.5) * 0.09 +
                (1 - t) * 0.02,
        );
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ map: texture, roughness: 0.88 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
}
const book = new THREE.Group();
const cover = new THREE.Mesh(
    new RoundedBoxGeometry(4.75, 0.12, 3.25, 3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.55 }),
);
cover.position.y = 0.06;
cover.castShadow = true;
const lp = page(leftPage, "left");
lp.position.set(-1.12, 0.14, 0);
const rp = page(rightPage, "right");
rp.position.set(1.12, 0.14, 0);
book.add(cover, lp, rp);
book.position.set(5.3, 0, -0.95);
book.rotation.y = -0.14;
scene.add(book);

// ── the phase, engraved on a plaque at the far side of the bezel ─────────────────
const plaqueTex = (() => {
    const [c, g] = makeCanvas(1024, 224);
    const grad = g.createLinearGradient(0, 0, 0, 224);
    grad.addColorStop(0, "#f2db9a");
    grad.addColorStop(0.45, "#c49e48");
    grad.addColorStop(1, "#a37f30");
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 224);
    g.textAlign = "center";
    g.fillStyle = "rgba(48, 32, 8, .9)";
    g.font = `30px ${PLAQUE}`;
    g.fillText("R O U N D   I I I  ·  T H E   N A V I G A T O R", 512, 70);
    g.font = `bold 92px ${PRINT}`;
    g.fillText("第三轮 · 领航抉择", 512, 172);
    return canvasTexture(c);
})();
const plaque = new THREE.Mesh(
    new RoundedBoxGeometry(2.9, 0.07, 0.64, 2, 0.03),
    [
        brassPlain,
        brassPlain,
        new THREE.MeshStandardMaterial({
            map: plaqueTex,
            metalness: 0.75,
            roughness: 0.35,
        }),
        brassPlain,
        brassPlain,
        brassPlain,
    ],
);
plaque.position.set(CHART.x, BEZEL_TOP + 0.04, CHART.z - BEZEL_R - 0.05);
plaque.castShadow = true;
scene.add(plaque);

// ── name slips: crisp HTML pinned to each seal's place on screen ───────────────────
const hud = document.getElementById("slips");
for (const s of seats) {
    const p = s.player;
    const el = document.createElement("div");
    el.className = "tag parchment slip";
    if (p.dead) el.dataset.dead = "";
    if (p.me) el.dataset.me = "";
    const stamps = [
        p.muted && `<span class="stamp">割舌</span>`,
        p.offDuty && `<span class="stamp is-verdigris">下班</span>`,
        p.notPirate && `<span class="stamp is-ink">不是海盗</span>`,
        p.dead && `<span class="stamp">离船</span>`,
    ]
        .filter(Boolean)
        .join("");
    el.innerHTML = `<span class="tag-name">${p.name}${p.me ? "<small>你</small>" : ""}</span><span class="tag-meta"><span class="guns"><img src="/art/gun.webp" alt="">${p.guns}</span>${stamps}</span>`;
    hud.append(el);
    s.slip = el;
    s.slipAt = onRing(s.angle, SEAT_R, BEZEL_TOP);
    // Slips sit beside their seal on the outer side; the near and far seals get theirs below / above.
    const cos = Math.cos(s.angle);
    s.side =
        cos > 0.25
            ? "right"
            : cos < -0.25
              ? "left"
              : Math.sin(s.angle) > 0
                ? "below"
                : "above";
}

// ── interaction: lean with the pointer, lift a card under it, summon the deep ─────────
const params = new URLSearchParams(location.search);
const orbit = params.has("orbit") ? new OrbitControls(camera, canvas) : null;
if (orbit) orbit.target.copy(LOOK);
const lean = new THREE.Vector2();
const leanTarget = new THREE.Vector2();
const ndc = new THREE.Vector2(-9, -9);
addEventListener("pointermove", (e) => {
    leanTarget.set(
        (e.clientX / innerWidth - 0.5) * 2,
        (e.clientY / innerHeight - 0.5) * 2,
    );
    ndc.set(
        (e.clientX / innerWidth) * 2 - 1,
        -(e.clientY / innerHeight) * 2 + 1,
    );
});
const raycaster = new THREE.Raycaster();
let deep = params.has("deep") ? 1 : 0;
let deepLevel = deep;
const showDeep = () => {
    document
        .getElementById("deep")
        ?.setAttribute("aria-pressed", String(Boolean(deep)));
    document.body.toggleAttribute("data-deep", Boolean(deep));
};
showDeep();
document.getElementById("deep")?.addEventListener("click", () => {
    deep = deep ? 0 : 1;
    showDeep();
});
// When the kraken is near, the chart stops being paper: something comes up through its throat.
const throat = chartPoint("0:4");
const bigTentacle = await place("tentacle", {
    size: 2.5,
    at: new THREE.Vector3(throat.x + 0.5, -2.7, throat.z - 0.2),
    rotation: [0, 0.5, 0],
    shadow: false,
});
const tentacleHome = bigTentacle.position.y;
const krakenScale = kraken.scale.x;
const throatGlow = new THREE.PointLight(0x3fd6b0, 0, 6, 1.6);
throatGlow.position.set(throat.x, 0.5, throat.z);
scene.add(throatGlow);
const deepGreen = new THREE.Color(0x8fd18a);
const flameWarm = new THREE.Color(0xff9a48);
const roomDark = scene.fog.color.clone();
const seaDark = new THREE.Color(0x041011);
const lanternHome = lantern.intensity;
const hemiHome = hemi.intensity;

// ?fp: seated in first person, at a slab of table with a near edge.
const fp = params.has("fp")
    ? (await import("./first-person.js")).firstPerson({
          scene,
          camera,
          home: HOME,
          look: LOOK,
          table,
          hand,
          dossier,
          dossierSeal,
      })
    : null;

function resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = fp?.fov ?? (w / h < 1.5 ? 44 : 36);
    camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
const projected = new THREE.Vector3();
function frame() {
    // A bad frame is reported and skipped; it must not stop every frame after it.
    try {
        draw();
    } catch (error) {
        console.error(error);
    }
    requestAnimationFrame(frame);
}
function draw() {
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    lean.lerp(leanTarget, 1 - Math.exp(-3 * dt));
    if (!orbit) {
        const reach = fp ? 0.5 : 1;
        camera.position.set(
            HOME.x + lean.x * 0.45 * reach,
            HOME.y - lean.y * 0.25 * reach,
            HOME.z + Math.abs(lean.x) * 0.1 * reach,
        );
        camera.lookAt(LOOK);
    } else orbit.update();

    // The flame breathes: two slow sines and a quick shiver.
    const flicker =
        1 +
        0.08 * Math.sin(t * 7.3) +
        0.05 * Math.sin(t * 13.1 + 1.7) +
        0.04 * Math.sin(t * 31.7);
    deepLevel += (deep - deepLevel) * (1 - Math.exp(-2.2 * dt));
    candleLight.intensity = 16 * flicker * (1 - deepLevel * 0.4);
    candleLight.color.copy(flameWarm).lerp(deepGreen, deepLevel * 0.65);
    throatGlow.intensity = deepLevel * (10 + 2.5 * Math.sin(t * 1.3));
    renderer.toneMappingExposure = 1.08 - deepLevel * 0.3;
    scene.environmentIntensity = 0.22 * (1 - deepLevel * 0.75);
    flame.scale.set(0.55 * flicker, 0.75 * flicker, 1);
    lantern.intensity = lanternHome * (1 - deepLevel * 0.86);
    hemi.intensity = hemiHome * (1 - deepLevel * 0.8);
    scene.fog.near = 15 - deepLevel * 3;
    scene.fog.far = 30 - deepLevel * 6;
    scene.fog.color.copy(roomDark).lerp(seaDark, deepLevel);
    scene.background.copy(scene.fog.color);
    bigTentacle.position.y = tentacleHome + deepLevel * 2.55;
    bigTentacle.rotation.z = Math.sin(t * 0.8) * 0.05 * deepLevel;
    kraken.scale.setScalar(krakenScale * (1 + deepLevel * 0.9));
    glow.material.opacity = 0.75 + 0.2 * Math.sin(t * 2.2);

    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(hand.map((h) => h.mesh))[0]?.object;
    for (const h of hand) {
        const want = h.chosen ? 1 : h.mesh === hit ? 0.55 : 0;
        h.lift += (want - h.lift) * (1 - Math.exp(-10 * dt));
        h.mesh.position.y = h.at.y + h.lift * 0.32;
        h.mesh.rotation.x = h.lift * 0.42;
    }
    const chosen = hand.find((h) => h.chosen);
    highlight.position.set(
        chosen.mesh.position.x,
        0.012,
        chosen.mesh.position.z,
    );
    highlight.material.opacity = 0.55 + 0.25 * Math.sin(t * 2.4);
    fp?.update();

    for (const s of seats) {
        projected.copy(s.slipAt).project(camera);
        const x = ((projected.x + 1) / 2) * innerWidth;
        const y = ((1 - projected.y) / 2) * innerHeight;
        const spots = {
            right: `translate(${x + 30}px, ${y}px) translate(0, -50%) rotate(-1.4deg)`,
            left: `translate(${x - 30}px, ${y}px) translate(-100%, -50%) rotate(1.4deg)`,
            below: `translate(${x}px, ${y + 30}px) translate(-50%, 0) rotate(-1deg)`,
            above: `translate(${x}px, ${y - 26}px) translate(-50%, -100%) rotate(1deg)`,
        };
        s.slip.style.transform = spots[s.side];
    }
    renderer.render(scene, camera);
}
requestAnimationFrame(frame);
window.__table = { renderer, scene, camera };
document.body.dataset.ready = "true";
