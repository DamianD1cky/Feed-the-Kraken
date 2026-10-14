// 圆桌 · the round table from your own chair. The map lies in the frame at the table's centre, the
// crew's seals stand around the rim, your cards lie at the near edge. Nobody else is drawn: the
// others are their seals and their name slips. Prototype only: round-table.html
// (&map: leaning in over the map; &deep: the kraken close).
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { prop } from "/src/table3d/models.ts";
import {
    FONT,
    canvasTexture,
    cardBack,
    coinFace,
    identityFace,
    loadArt,
    makeCanvas,
    navCardFace,
    paintMarker,
    paintPlaque,
    rng,
    roman,
    secretBack,
    setAnisotropy,
    woodTexture,
} from "/src/table3d/paint.ts";
import {
    Kit,
    buildPlaque,
    cardMesh,
    compassCoin,
    contactShadow,
    glowPlane,
    waxSeal,
} from "/src/table3d/pieces.ts";
import { createSeaChartLayout } from "/src/table3d/seaChartLayout.ts";
import { V, firstPerson } from "./first-person.js";

const params = new URLSearchParams(location.search);

// ── the moment on the table (as in table-3d.html) ──────────────────────────
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
const route = ["0,0", "0,1", "-1,1"];
// The quick voyage's orders (createQuickMapActions), less the search the ship has just triggered.
const markers = {
    "-2,1": "cabin_search",
    "1,1": "cabin_search",
    "-1,3": "feed_kraken",
    "1,3": "feed_kraken",
};
const offered = [
    { direction: "west", effect: "drunk" },
    { direction: "north", effect: "telescope" },
];
const lastPlayed = { direction: "east", effect: "armed" };

// ── renderer, scene, camera ────────────────────────────────────────────────
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
setAnisotropy(renderer.capabilities.getMaxAnisotropy());

const FOG = { near: 20, far: 44 };
const roomDark = new THREE.Color(0x090604);
const seaDark = new THREE.Color(0x041011);
const scene = new THREE.Scene();
scene.background = roomDark.clone();
scene.fog = new THREE.Fog(roomDark.clone(), FOG.near, FOG.far);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(
    new RoomEnvironment(),
    0.04,
).texture;
scene.environmentIntensity = 0.22;

const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 90);
const HOME = new THREE.Vector3();
const LOOK = new THREE.Vector3();

const hemi = new THREE.HemisphereLight(0x6e7d96, 0x1a1009, 0.3);
// One lantern hangs over the middle of the table.
const lantern = new THREE.SpotLight(0xffd29a, 620, 60, 0.47, 0.9, 1.7);
lantern.position.set(2.5, 22, 2.5);
lantern.target.position.set(0, 0, 0.6);
lantern.castShadow = true;
lantern.shadow.mapSize.set(2048, 2048);
lantern.shadow.bias = -0.0003;
lantern.shadow.normalBias = 0.02;
scene.add(hemi, lantern, lantern.target);

const kit = new Kit();
const images = await loadArt();

// ── the table ──────────────────────────────────────────────────────────────
/** The top is 1.05 m across at about 5 cm to a unit; y = 0 is its surface, +z points at your chair. */
const TABLE_R = 10.5;
/** The frame at the centre of the top: the inner panel the map lies in, in table units. */
const INSET = { halfW: 4.3, halfD: 3.25 };

const desk = await prop("desk", { size: TABLE_R * 2 });
// As exported the whole top is half metal and lacquer-red; old mahogany is darker and only the studs shine.
desk.traverse((o) => {
    if (!o.isMesh) return;
    o.material.color.set(0x9c7a68);
    o.material.metalness = 0.45;
});
scene.add(desk);
const down = new THREE.Raycaster();
const heightAt = (x, z) => {
    desk.updateMatrixWorld(true);
    down.set(V(x, 100, z), V(0, -1, 0));
    return down.intersectObject(desk, true)[0]?.point.y ?? 0;
};
desk.position.y = -heightAt(TABLE_R * 0.72, 0);
const FLOOR_Y = desk.position.y;

/** Presses every vertex of `root` inside the box flat at height `y`: the inset's carved boss would lift the map. */
function flatten(root, halfW, halfD, y) {
    const p = new THREE.Vector3();
    const back = new THREE.Matrix4();
    root.updateMatrixWorld(true);
    root.traverse((o) => {
        if (!o.isMesh) return;
        const position = o.geometry.attributes.position;
        back.copy(o.matrixWorld).invert();
        let moved = false;
        for (let i = 0; i < position.count; i++) {
            p.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
            if (Math.abs(p.x) > halfW || Math.abs(p.z) > halfD || p.y <= y)
                continue;
            p.y = y;
            p.applyMatrix4(back);
            position.setXYZ(i, p.x, p.y, p.z);
            moved = true;
        }
        if (moved) {
            position.needsUpdate = true;
            o.geometry.computeBoundingSphere();
            o.geometry.computeBoundingBox();
        }
    });
}
const panelY = Math.min(
    heightAt(INSET.halfW - 0.2, 0),
    heightAt(-INSET.halfW + 0.2, 0),
    heightAt(0, INSET.halfD - 0.2),
    heightAt(0, -INSET.halfD + 0.2),
);
flatten(desk, INSET.halfW, INSET.halfD, panelY);

// ── the map ────────────────────────────────────────────────────────────────
const SHEET = {
    w: INSET.halfW * 2 - 0.1,
    d: INSET.halfD * 2 - 0.1,
    y: panelY + 0.012,
};
const SHEET_W = 2048;
const SHEET_H = Math.round((SHEET_W * SHEET.d) / SHEET.w);
const INK = "#3a2b1b";
/** The board's own colours: pale water, the three shores, the dark border it is printed on. */
const PRINT = {
    water: "#a2cdea",
    line: "#2f8fa3",
    pirate: "#d2401c",
    cult: "#e3a514",
    sailor: "#3f8fe0",
    border: "#2a292e",
};

/** The server's hex layout fitted to the sheet, shared by the print and by the pieces standing on it. */
function boardOf(mode) {
    const layout = createSeaChartLayout(mode);
    const xs = layout.frame.map((p) => p.x);
    const ys = layout.frame.map((p) => p.y);
    const [x0, x1, y0, y1] = [
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...ys),
        Math.max(...ys),
    ];
    // The dark border reaches this far past the outermost hexes, in layout pixels.
    const pad = 56 * 0.5;
    const k = Math.min(
        (SHEET_H - 120) / (y1 - y0 + 2 * pad),
        (SHEET_W - 560) / (x1 - x0 + 2 * pad),
    );
    const ox = SHEET_W / 2 - ((x0 + x1) / 2) * k;
    const oy = SHEET_H / 2 - ((y0 + y1) / 2) * k;
    const px = (x, y) => [ox + x * k, oy + y * k];
    const cell = (key) => layout.cells.find((c) => c.key === key);
    const point = (x, y, lift = 0) => {
        const [cx, cy] = px(x, y);
        return V(
            (cx / SHEET_W - 0.5) * SHEET.w,
            SHEET.y + lift,
            (cy / SHEET_H - 0.5) * SHEET.d,
        );
    };
    return {
        layout,
        pad: pad * k,
        hexPx: 56 * k,
        /** A hex's radius on the table. */
        hexU: (56 * k * SHEET.w) / SHEET_W,
        centre: px((x0 + x1) / 2, (y0 + y1) / 2),
        px,
        cell,
        at: (key, lift) => {
            const c = cell(key);
            return point(c.x, c.y, lift);
        },
    };
}

function hexPath(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        g[i ? "lineTo" : "moveTo"](x + r * Math.cos(a), y + r * Math.sin(a));
    }
    g.closePath();
}

function speckle(g, w, h, amount, rand) {
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
        const n = (rand() - 0.5) * amount;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
}

/** A compass rose printed in the corner: north toward the kraken, east to the navy, west to the pirates. */
function compassRose(g, x, y, r) {
    g.save();
    g.translate(x, y);
    g.strokeStyle = INK;
    for (const [rr, w] of [
        [r, 3],
        [r * 0.9, 1.5],
        [r * 0.34, 1.5],
    ]) {
        g.beginPath();
        g.arc(0, 0, rr, 0, Math.PI * 2);
        g.lineWidth = w;
        g.stroke();
    }
    for (let i = 0; i < 64; i++) {
        const a = (i * Math.PI) / 32;
        const long = i % 8 === 0 ? 0.16 : i % 2 === 0 ? 0.09 : 0.05;
        g.beginPath();
        g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        g.lineTo(Math.cos(a) * r * (1 - long), Math.sin(a) * r * (1 - long));
        g.lineWidth = 1.5;
        g.stroke();
    }
    const points = (n, long, short, turn) => {
        for (let i = 0; i < n; i++) {
            const a = turn + (i * 2 * Math.PI) / n - Math.PI / 2;
            const tip = [Math.cos(a) * long, Math.sin(a) * long];
            const left = [
                Math.cos(a - Math.PI / n) * short,
                Math.sin(a - Math.PI / n) * short,
            ];
            const right = [
                Math.cos(a + Math.PI / n) * short,
                Math.sin(a + Math.PI / n) * short,
            ];
            for (const [side, fill] of [
                [left, INK],
                [right, "#efe2c0"],
            ]) {
                g.beginPath();
                g.moveTo(0, 0);
                g.lineTo(...side);
                g.lineTo(...tip);
                g.closePath();
                g.fillStyle = fill;
                g.fill();
                g.lineWidth = 1.5;
                g.stroke();
            }
        }
    };
    points(8, r * 0.62, r * 0.12, Math.PI / 8);
    points(4, r * 0.96, r * 0.17, 0);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${Math.round(r * 0.24)}px ${FONT.plaque}`;
    for (const [text, a, colour] of [
        ["N", -Math.PI / 2, "#8e2a1c"],
        ["E", 0, INK],
        ["S", Math.PI / 2, INK],
        ["W", Math.PI, INK],
    ]) {
        g.fillStyle = colour;
        g.fillText(text, Math.cos(a) * r * 1.16, Math.sin(a) * r * 1.16);
    }
    g.restore();
}

/** A title box with notched corners, the way an engraver frames the name of a sea. */
function cartouche(g, x, y, w, h) {
    const notched = (inset, notch) => {
        const [l, t, r, b] = [
            x + inset,
            y + inset,
            x + w - inset,
            y + h - inset,
        ];
        g.beginPath();
        g.moveTo(l + notch, t);
        g.lineTo(r - notch, t);
        g.arc(r, t, notch, Math.PI, Math.PI / 2, true);
        g.lineTo(r, b - notch);
        g.arc(r, b, notch, -Math.PI / 2, Math.PI, true);
        g.lineTo(l + notch, b);
        g.arc(l, b, notch, 0, -Math.PI / 2, true);
        g.lineTo(l, t + notch);
        g.arc(l, t, notch, Math.PI / 2, 0, true);
        g.closePath();
    };
    g.save();
    notched(0, 20);
    g.fillStyle = "rgba(246, 236, 210, .75)";
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.stroke();
    notched(9, 14);
    g.lineWidth = 1.2;
    g.stroke();
    g.textAlign = "center";
    g.fillStyle = INK;
    g.font = `bold ${Math.round(h * 0.4)}px ${FONT.print}`;
    g.fillText("险恶疑航", x + w / 2, y + h * 0.54);
    g.font = `italic ${Math.round(h * 0.15)}px ${FONT.latin}`;
    g.fillStyle = "#6b5640";
    g.fillText("Mare Krakenis · Charta Nautica", x + w / 2, y + h * 0.8);
    g.restore();
}

let paper;
/** The sheet as it left the printer: the paper's colour, the ruled border, the rose and the title. */
function paperBase(board) {
    if (paper) return paper;
    const [c, g] = makeCanvas(SHEET_W, SHEET_H);
    const [W, H] = [SHEET_W, SHEET_H];
    const bg = g.createRadialGradient(
        W * 0.5,
        H * 0.45,
        60,
        W * 0.5,
        H * 0.5,
        W * 0.66,
    );
    bg.addColorStop(0, "#efe3c2");
    bg.addColorStop(0.55, "#e2cd9c");
    bg.addColorStop(0.88, "#cdb07a");
    bg.addColorStop(1, "#a98a54");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // A graduated border: two rules, the band between them filled black and paper by turns.
    const m = 24;
    const band = 16;
    g.fillStyle = INK;
    const seg = 72;
    for (let x = m, i = 0; x < W - m; x += seg, i++) {
        if (i % 2) continue;
        g.fillRect(x, m, Math.min(seg, W - m - x), band);
        g.fillRect(
            W - x - Math.min(seg, W - m - x),
            H - m - band,
            Math.min(seg, W - m - x),
            band,
        );
    }
    for (let y = m, i = 0; y < H - m; y += seg, i++) {
        if (i % 2 === 0) continue;
        g.fillRect(m, y, band, Math.min(seg, H - m - y));
        g.fillRect(
            W - m - band,
            H - y - Math.min(seg, H - m - y),
            band,
            Math.min(seg, H - m - y),
        );
    }
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.strokeRect(m, m, W - 2 * m, H - 2 * m);
    g.lineWidth = 2;
    g.strokeRect(m + band, m + band, W - 2 * (m + band), H - 2 * (m + band));
    g.lineWidth = 1;
    g.strokeRect(
        m + band + 8,
        m + band + 8,
        W - 2 * (m + band + 8),
        H - 2 * (m + band + 8),
    );
    // Rhumb lines from the rose run across the open paper, under everything else.
    const rose = [W - 250, H - 250];
    g.save();
    g.strokeStyle = "rgba(90, 70, 46, .16)";
    g.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        g.beginPath();
        g.moveTo(...rose);
        g.lineTo(rose[0] + Math.cos(a) * 3000, rose[1] + Math.sin(a) * 3000);
        g.stroke();
    }
    g.restore();
    compassRose(g, rose[0], rose[1], 150);
    cartouche(g, 84, 84, 470, 168);
    // A scale of leagues, bottom left: one hex is one day's sail.
    const hex = board.hexPx * 1.5;
    g.save();
    g.translate(96, H - 112);
    for (let i = 0; i < 3; i++) {
        g.fillStyle = i % 2 ? "#efe2c0" : INK;
        g.fillRect(i * hex, 0, hex, 14);
    }
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(0, 0, hex * 3, 14);
    g.fillStyle = INK;
    g.textAlign = "center";
    g.font = `26px ${FONT.numeral}`;
    for (let i = 0; i <= 3; i++) g.fillText(String(i), i * hex, 46);
    g.font = `italic 26px ${FONT.latin}`;
    g.textAlign = "left";
    g.fillText("Dies navigandi · 航行日数", 0, -16);
    g.restore();
    paper = c;
    return c;
}

let grain;
/** Stains, specks and the two folds the map was carried in; laid over everything as a multiply. */
function grainOver() {
    if (grain) return grain;
    const rand = rng(1871);
    const [c, g] = makeCanvas(SHEET_W, SHEET_H);
    const [W, H] = [SHEET_W, SHEET_H];
    g.fillStyle = "#fff";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 28; i++) {
        const x = rand() * W;
        const y = rand() * H;
        const r = 50 + rand() * 260;
        const s = g.createRadialGradient(x, y, 0, x, y, r);
        s.addColorStop(0, `rgba(150, 105, 55, ${0.05 + rand() * 0.1})`);
        s.addColorStop(1, "rgba(150, 105, 55, 0)");
        g.fillStyle = s;
        g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (const [x0, y0, x1, y1] of [
        [W / 2, 0, W / 2, H],
        [0, H / 2, W, H / 2],
    ]) {
        g.strokeStyle = "rgba(120, 88, 50, .3)";
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
    }
    speckle(g, W, H, 16, rand);
    grain = c;
    return c;
}

/** The map for one moment: the printed board, then the voyage inked onto it by hand. */
function paintMap(g, board, actions, trail) {
    const hex = board.hexPx;
    g.drawImage(paperBase(board), 0, 0);
    const hull = board.layout.frame.map((p) => board.px(p.x, p.y));
    g.save();
    g.beginPath();
    hull.forEach(([x, y], i) => g[i ? "lineTo" : "moveTo"](x, y));
    g.closePath();
    g.fillStyle = PRINT.border;
    g.strokeStyle = PRINT.border;
    g.lineJoin = "miter";
    g.miterLimit = 4;
    g.lineWidth = board.pad * 2;
    g.stroke();
    g.fill();
    g.restore();
    for (const cell of board.layout.cells) {
        const [x, y] = board.px(cell.x, cell.y);
        hexPath(g, x, y, hex);
        g.fillStyle = PRINT[cell.kind];
        g.fill();
        g.strokeStyle = PRINT.line;
        g.lineWidth = hex * 0.05;
        g.stroke();
    }
    g.save();
    g.globalCompositeOperation = "multiply";
    g.drawImage(grainOver(), 0, 0);
    g.restore();

    // Inked by hand over the print: where the voyage began, the wake so far, the orders left on the map.
    const [sx, sy] = board.px(board.cell("0,0").x, board.cell("0,0").y);
    g.save();
    g.translate(sx, sy);
    g.fillStyle = "rgba(58, 43, 27, .7)";
    g.beginPath();
    for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const r = i % 2 ? hex * 0.14 : hex * 0.46;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
    g.font = `${Math.round(hex * 0.26)}px ${FONT.hand}`;
    g.textAlign = "center";
    g.fillStyle = INK;
    g.fillText("起点", 0, hex * 0.8);
    g.restore();

    const points = trail.map((key) =>
        board.px(board.cell(key).x, board.cell(key).y),
    );
    if (points.length > 1) {
        g.setLineDash([2, hex * 0.15]);
        g.lineCap = "round";
        g.lineWidth = Math.max(5, hex * 0.06);
        g.strokeStyle = INK;
        g.beginPath();
        points.forEach(([x, y], i) => g[i ? "lineTo" : "moveTo"](x, y));
        g.stroke();
        g.setLineDash([]);
        g.font = `italic ${Math.round(hex * 0.27)}px ${FONT.latin}`;
        g.fillStyle = INK;
        g.textAlign = "center";
        points
            .slice(1)
            .forEach(([x, y], i) =>
                g.fillText(roman(i + 1), x + hex * 0.42, y + hex * 0.52),
            );
    }
    for (const [key, action] of Object.entries(actions)) {
        const c = board.cell(key);
        const [x, y] = board.px(c.x, c.y);
        paintMarker(g, x, y - hex * 0.08, hex * 0.36, action, images);
    }

    // The two shores are named on the open paper past the border; the throat, in the border above it.
    const [mx, my] = board.centre;
    const shore = (kind, text, latin) => {
        const cells = board.layout.cells.filter((c) => c.kind === kind);
        const [cx, cy] = board.px(
            cells.reduce((s, c) => s + c.x, 0) / cells.length,
            cells.reduce((s, c) => s + c.y, 0) / cells.length,
        );
        const away = Math.atan2(cy - my, cx - mx);
        const reach = hex * 1.45 + board.pad;
        g.save();
        g.translate(cx + Math.cos(away) * reach, cy + Math.sin(away) * reach);
        g.rotate(away + Math.PI / 2);
        g.textAlign = "center";
        g.font = `${Math.round(hex * 0.34)}px ${FONT.hand}`;
        g.fillStyle = "#4a3925";
        g.fillText(text, 0, 0);
        g.font = `italic ${Math.round(hex * 0.2)}px ${FONT.latin}`;
        g.fillStyle = "#7a6347";
        g.fillText(latin, 0, hex * 0.27);
        g.restore();
    };
    shore("pirate", "海盗湾", "Sinus Piratarum");
    shore("sailor", "皇家航道", "Via Regia");
    const throat = board.cell("0,5");
    const [tx, ty] = board.px(throat.x, throat.y);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${Math.round(board.pad * 0.62)}px ${FONT.hand}`;
    g.fillStyle = "#d9c79c";
    g.fillText(
        "克 拉 肯 之 喉",
        tx,
        ty - hex * Math.sin(Math.PI / 3) - board.pad * 0.5,
    );
    g.textBaseline = "alphabetic";
}

const board = boardOf("quick");
const [sheetCanvas, sheetCtx] = makeCanvas(SHEET_W, SHEET_H);
paintMap(sheetCtx, board, markers, route);
const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(SHEET.w, SHEET.d),
    new THREE.MeshStandardMaterial({
        map: canvasTexture(sheetCanvas),
        roughness: 0.9,
    }),
);
sheet.rotation.x = -Math.PI / 2;
sheet.position.y = SHEET.y;
sheet.receiveShadow = true;
scene.add(sheet);

/** A model standing at `at`, with a soft contact shadow under it. */
async function place(name, { size, at, rotation, yaw = 0, shadow = true }) {
    const holder = await prop(name, { size, rotation, shadow });
    holder.position.copy(at);
    holder.rotation.y = yaw;
    scene.add(holder);
    if (shadow) {
        const footprint = holder.userData.footprint;
        const blot = contactShadow(kit, footprint.x * 1.3, footprint.z * 1.3);
        blot.position.set(at.x, at.y + 0.004, at.z);
        blot.rotation.z = -yaw;
        scene.add(blot);
    }
    return holder;
}

// The ship sits on its hex, bow along the last leg of the wake (the model's bow points along −x).
const [from, to] = route.slice(-2).map((key) => board.at(key));
const heading = Math.atan2(to.z - from.z, -(to.x - from.x));
const kraken = await place("tentacle-small", {
    size: board.hexU * 1.5,
    at: board.at("0,5"),
    yaw: -0.4,
});
await place("ship-sails", {
    size: board.hexU * 2.1,
    at: to,
    rotation: [0, 0, 0],
    yaw: heading,
});

// ── the crew around the rim ────────────────────────────────────────────────
const SEAT_R = 8.3;
const viewer = players.findIndex((p) => p.me);
const seatAngle = (i) =>
    Math.PI / 2 +
    ((((i - viewer) % players.length) + players.length) % players.length) *
        ((2 * Math.PI) / players.length);
const onRim = (angle, radius, y = 0) =>
    V(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
const seats = players.map((player, i) => {
    const angle = seatAngle(i);
    const seal = waxSeal(kit, String(player.seat), {
        dim: player.dead,
        radius: 0.36,
    });
    seal.position.copy(onRim(angle, SEAT_R));
    seal.rotation.y = (kit.rand() - 0.5) * 0.4;
    if (!player.me) scene.add(seal);
    return { player, angle, seal };
});
const seatOf = (n) => seats.find((s) => s.player.seat === n);
/** Beside a seal along the rim (`along` in radians), `out` toward the table's edge. */
const besideSeat = (n, along, out = 0) =>
    onRim(seatOf(n).angle + along, SEAT_R + out);

await Promise.all([
    place("helm", {
        size: 0.8,
        at: besideSeat(3, 0.13),
        rotation: [-Math.PI / 2, 0, 0.3],
    }),
    place("mate-badge", {
        size: 0.66,
        at: besideSeat(7, -0.13),
        rotation: [-Math.PI / 2, 0, -0.2],
    }),
    place("off-duty", { size: 0.55, at: besideSeat(2, -0.13), yaw: -0.5 }),
    place("off-duty", { size: 0.55, at: besideSeat(9, 0.13), yaw: 0.4 }),
    place("knife", {
        size: 0.8,
        at: besideSeat(2, 0.1, 1.0),
        rotation: [0, 0.9, Math.PI / 2],
    }),
    // Your own pistol, by your right hand.
    place("pistol", {
        size: 1.3,
        at: V(4.4, 0, 8.7),
        rotation: [0, 0.55, Math.PI / 2],
    }),
]);
const coin = compassCoin(kit, coinFace(images));
coin.position.set(1.9, 0, 8.6);
scene.add(coin);

// ── the middle of the table: the deck, the last route played, the candle, the plaque ──
const back = cardBack(images);
const deck = new THREE.Group();
for (let i = 0; i < 9; i++) {
    const card = cardMesh(kit, back, back);
    card.position.y = 0.0125 + i * 0.03;
    card.rotation.y = (kit.rand() - 0.5) * 0.08;
    deck.add(card);
}
deck.position.set(6.6, 0, -1.7);
deck.rotation.y = 0.32;
const reveal = cardMesh(kit, navCardFace(lastPlayed, images), back);
reveal.position.set(6.35, 0.0125, 0.45);
reveal.rotation.y = -0.18;
scene.add(deck, reveal);
const deckShadow = contactShadow(kit, 1.9, 1.9);
deckShadow.position.set(6.6, 0.004, -1.7);
scene.add(deckShadow);

const candle = await place("candle", {
    size: 1.7,
    at: V(-6.7, 0, -1.6),
    yaw: 0.6,
});
const flamePos = V(-6.7, candle.userData.footprint.y + 0.05, -1.6);
const candleLight = new THREE.PointLight(0xff9a48, 18, 13, 1.8);
candleLight.position.copy(flamePos);
const flame = new THREE.Sprite(
    new THREE.SpriteMaterial({
        map: kit.glow,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    }),
);
flame.scale.set(0.55, 0.75, 1);
flame.position.copy(flamePos);
scene.add(candleLight, flame);

// The phase plaque leans up on the far side of the frame, so it reads from your chair.
const plaque = buildPlaque(kit);
paintPlaque(plaque.ctx, "navigator_nav", 3);
plaque.texture.needsUpdate = true;
plaque.plaque.position.set(0, 0.33, -5.25);
plaque.plaque.rotation.x = 1.05;
scene.add(plaque.plaque);

// ── in front of you ────────────────────────────────────────────────────────
const hand = offered.map((card, i) => {
    const mesh = cardMesh(kit, navCardFace(card, images), back);
    const at = V(i ? 0.88 : -0.88, 0.0125, 7.3);
    mesh.position.copy(at);
    mesh.rotation.y = i ? -0.06 : 0.07;
    scene.add(mesh);
    return { mesh, at, chosen: i === 0, lift: 0 };
});
const highlight = glowPlane(kit, 2.4);
highlight.position.y = 0.012;
scene.add(highlight);
const dossier = cardMesh(
    kit,
    secretBack(images),
    identityFace("pirate", "pirate", images),
    { w: 0.9, d: 1.2 },
);
const dossierSeal = waxSeal(kit, "密", { radius: 0.2 });
scene.add(dossier, dossierSeal);

/** Where you sit at this table: your eyes 41 cm above the top and 19 cm back from its near edge. */
const ROUND_SEAT = {
    fov: 50,
    seated: { pos: V(0, 8.3, 14.3), look: V(0, 0, 4.2) },
    floor: { y: FLOOR_Y, z: 4 },
    dossier: { at: V(-3.05, 0.0125, 8.45), yaw: 0.12 },
};
const fp = firstPerson({
    scene,
    camera,
    home: HOME,
    look: LOOK,
    floorMap: kit.own(woodTexture()),
    hand,
    dossier,
    dossierSeal,
    seat: ROUND_SEAT,
});

// ── name slips: crisp HTML pinned beside each seal ─────────────────────────
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
    s.slipAt = onRim(s.angle, SEAT_R, 0.1);
    s.side =
        Math.cos(s.angle) > 0.25
            ? "right"
            : Math.cos(s.angle) < -0.25
              ? "left"
              : Math.sin(s.angle) > 0
                ? "below"
                : "above";
}

// ── the frame loop ─────────────────────────────────────────────────────────
const lean = new THREE.Vector2();
const leanTarget = new THREE.Vector2();
const ndc = new THREE.Vector2(-9, -9);
// Over a button (the confirm slip covers the near edge of the map) the pointer is not looking at the table.
let onScene = false;
addEventListener("pointermove", (e) => {
    leanTarget.set(
        (e.clientX / innerWidth - 0.5) * 2,
        (e.clientY / innerHeight - 0.5) * 2,
    );
    ndc.set(
        (e.clientX / innerWidth) * 2 - 1,
        -(e.clientY / innerHeight) * 2 + 1,
    );
    onScene = e.target === canvas;
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
const deepGreen = new THREE.Color(0x8fd18a);
const flameWarm = new THREE.Color(0xff9a48);
const lanternHome = lantern.intensity;
const hemiHome = hemi.intensity;
const krakenScale = kraken.scale.x;

// Rest your eyes on the map and you lean in over it: closer, and the rest of the room narrows away.
// ?map holds you there.
const OVER_MAP = { pos: V(0, 7.6, 8.4), look: V(0, 0, -0.5), fov: 40 };
let over = params.has("map") ? 1 : 0;
const inOut = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (2 - 2 * u) ** 3 / 2);

function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
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
    raycaster.setFromCamera(ndc, camera);
    const onMap =
        params.has("map") ||
        (onScene && raycaster.intersectObject(sheet).length > 0);
    over += ((onMap ? 1 : 0) - over) * (1 - Math.exp(-2.4 * dt));
    const k = inOut(over);
    camera.position
        .set(
            HOME.x + lean.x * 0.22,
            HOME.y - lean.y * 0.12,
            HOME.z + Math.abs(lean.x) * 0.05,
        )
        .lerp(OVER_MAP.pos, k);
    camera.lookAt(LOOK.clone().lerp(OVER_MAP.look, k));
    const fov = fp.fov + (OVER_MAP.fov - fp.fov) * k;
    if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
    }

    // The flame breathes: two slow sines and a quick shiver.
    const flicker =
        1 +
        0.08 * Math.sin(t * 7.3) +
        0.05 * Math.sin(t * 13.1 + 1.7) +
        0.04 * Math.sin(t * 31.7);
    deepLevel += (deep - deepLevel) * (1 - Math.exp(-2.2 * dt));
    candleLight.intensity = 18 * flicker * (1 - deepLevel * 0.4);
    candleLight.color.copy(flameWarm).lerp(deepGreen, deepLevel * 0.65);
    flame.scale.set(0.55 * flicker, 0.75 * flicker, 1);
    renderer.toneMappingExposure = 1.08 - deepLevel * 0.3;
    scene.environmentIntensity = 0.22 * (1 - deepLevel * 0.75);
    lantern.intensity = lanternHome * (1 - deepLevel * 0.86);
    hemi.intensity = hemiHome * (1 - deepLevel * 0.8);
    scene.fog.near = FOG.near - deepLevel * 4;
    scene.fog.far = FOG.far - deepLevel * 8;
    scene.fog.color.copy(roomDark).lerp(seaDark, deepLevel);
    scene.background.copy(scene.fog.color);
    kraken.scale.setScalar(krakenScale * (1 + deepLevel * 0.9));

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
    fp.update();

    for (const s of seats) {
        projected.copy(s.slipAt).project(camera);
        const x = ((projected.x + 1) / 2) * innerWidth;
        const y = ((1 - projected.y) / 2) * innerHeight;
        const spots = {
            right: `translate(${x + 26}px, ${y}px) translate(0, -50%) rotate(-1.4deg)`,
            left: `translate(${x - 26}px, ${y}px) translate(-100%, -50%) rotate(1.4deg)`,
            below: `translate(${x}px, ${y + 26}px) translate(-50%, 0) rotate(-1deg)`,
            above: `translate(${x}px, ${y - 22}px) translate(-50%, -100%) rotate(1deg)`,
        };
        s.slip.style.transform = spots[s.side];
    }
    renderer.render(scene, camera);
}
requestAnimationFrame(frame);
window.__table = { renderer, scene, camera, desk, board, sheet };
document.body.dataset.ready = "true";
