import * as THREE from "three";
import type { CultRitualKind, Faction, MapAction, NavigationCard, Phase, PublicLogEntry, Role } from "@feed/shared";
import {
    art,
    effectHints,
    effectLabels,
    factionArt,
    factionLabel,
    mapActionArt,
    mapLabels,
    navFaceArt,
    phaseLabels,
    ritualArt,
    ritualLabels,
    roleLabel,
} from "../labels";
import { BEZEL_R, CHART_PX, DISC_R, type Chart } from "./layout";

export const FONT = {
    hand: '"Kaiti SC", "STKaiti", "KaiTi", "LXGW WenKai", serif',
    print: '"Songti SC", "Noto Serif SC", "STSong", "SimSun", serif',
    plaque: 'Copperplate, "Copperplate Gothic Light", Cinzel, serif',
    latin: '"Hoefler Text", "Big Caslon", Georgia, serif',
    numeral: 'Didot, "Bodoni 72", "Big Caslon", serif',
};

const INK = "#3a2b1b";

let anisotropy = 8;
export const setAnisotropy = (value: number) => void (anisotropy = value);

export function makeCanvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return [c, c.getContext("2d")!];
}

export function canvasTexture(c: HTMLCanvasElement) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    return t;
}

/** Seeded, so the grain of the table and the stains on the chart are the same every visit. */
export function rng(seed: number) {
    let s = seed | 0 || 1;
    return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 4294967296;
    };
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, amount: number, rand: () => number) {
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
        const n = (rand() - 0.5) * amount;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
}

// ── art the textures draw from ─────────────────────────────────────────────

export type Art = Map<string, HTMLImageElement>;

const ART_SOURCES = [
    ...Object.values(factionArt),
    ...Object.values(navFaceArt),
    ...Object.values(ritualArt),
    ...Object.values(mapActionArt),
    art.navBack,
    art.secret,
    art.compass,
];

export async function loadArt(): Promise<Art> {
    const loaded = await Promise.all(
        [...new Set(ART_SOURCES)].map(
            (src) =>
                new Promise<[string, HTMLImageElement] | undefined>((resolve) => {
                    const img = new Image();
                    img.decoding = "async";
                    img.onload = () => resolve([src, img]);
                    img.onerror = () => resolve(undefined);
                    img.src = src;
                }),
        ),
    );
    await Promise.all(
        [`40px ${FONT.hand}`, `40px ${FONT.print}`, `40px ${FONT.plaque}`, `italic 40px ${FONT.latin}`, `40px ${FONT.numeral}`].map((f) =>
            document.fonts.load(f).catch(() => []),
        ),
    );
    return new Map(loaded.filter((entry) => entry !== undefined));
}

function drawContained(g: CanvasRenderingContext2D, img: HTMLImageElement | undefined, x: number, y: number, size: number) {
    if (!img) return;
    const k = size / Math.max(img.width, img.height);
    g.drawImage(img, x - (img.width * k) / 2, y - (img.height * k) / 2, img.width * k, img.height * k);
}

// ── the table ──────────────────────────────────────────────────────────────

export function woodTexture() {
    const rand = rng(20261013);
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
            for (let x = 0; x <= 2048; x += 16) g.lineTo(x, y + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.3);
            const dark = rand() < 0.7;
            g.strokeStyle = dark ? `rgba(12, 6, 2, ${0.08 + rand() * 0.14})` : `rgba(140, 92, 52, ${0.04 + rand() * 0.06})`;
            g.lineWidth = 0.6 + rand() * 2.2;
            g.stroke();
        }
        g.fillStyle = "rgba(0, 0, 0, 0.75)";
        g.fillRect(0, y0, 2048, 3);
        g.fillStyle = "rgba(255, 210, 160, 0.06)";
        g.fillRect(0, y0 + 3, 2048, 1);
    }
    speckle(g, 2048, 1024, 10, rand);
    const t = canvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}

// ── the chart ──────────────────────────────────────────────────────────────

let parchment: HTMLCanvasElement | undefined;

/** Stains, grain and rhumb lines: everything on the chart that no move of the game changes. */
function parchmentBase() {
    if (parchment) return parchment;
    const rand = rng(1775);
    const [c, g] = makeCanvas(CHART_PX);
    const mid = CHART_PX / 2;
    const bg = g.createRadialGradient(mid, mid * 0.92, 120, mid, mid, mid);
    bg.addColorStop(0, "#e9d7ac");
    bg.addColorStop(0.62, "#d6bd88");
    bg.addColorStop(0.9, "#b89863");
    bg.addColorStop(1, "#8f7040");
    g.fillStyle = bg;
    g.fillRect(0, 0, CHART_PX, CHART_PX);
    for (let i = 0; i < 26; i++) {
        const x = rand() * CHART_PX;
        const y = rand() * CHART_PX;
        const r = 60 + rand() * 260;
        const s = g.createRadialGradient(x, y, 0, x, y, r);
        s.addColorStop(0, `rgba(120, 82, 40, ${0.04 + rand() * 0.07})`);
        s.addColorStop(1, "rgba(120, 82, 40, 0)");
        g.fillStyle = s;
        g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(g, CHART_PX, CHART_PX, 14, rand);
    for (const [ox, oy, n, alpha] of [
        [mid, mid, 32, 0.2],
        [mid * 0.26, mid * 1.4, 16, 0.14],
        [mid * 1.74, mid * 1.4, 16, 0.14],
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
    parchment = c;
    return c;
}

function hexPath(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        if (i) g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
        else g.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    g.closePath();
}

const WASH: Record<Faction, string> = { pirate: "rgba(161, 65, 45, .6)", sailor: "rgba(60, 109, 145, .58)", cult: "rgba(181, 134, 40, .62)" };
const ROMAN = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"];
export const roman = (n: number) => ROMAN[n] ?? String(n);

/** The chart for one moment: the hexes, what is left to trigger on them, and the wake behind the ship. */
export function paintChart(
    g: CanvasRenderingContext2D,
    chart: Chart,
    mapActions: Record<string, MapAction>,
    trail: Array<{ x: number; y: number }>,
    images: Art,
) {
    g.drawImage(parchmentBase(), 0, 0);
    const hex = chart.hexPx;
    for (const cell of chart.layout.cells) {
        const [x, y] = chart.px(cell.x, cell.y);
        hexPath(g, x, y, hex);
        if (cell.kind !== "water") {
            g.fillStyle = WASH[cell.kind];
            g.fill();
        }
        g.strokeStyle = cell.kind === "water" ? "rgba(46, 33, 20, .72)" : "rgba(46, 33, 20, .6)";
        g.lineWidth = Math.max(3, hex * 0.03);
        g.stroke();
        if (cell.kind !== "water") {
            g.globalAlpha = 0.92;
            drawContained(g, images.get(factionArt[cell.kind]), x, y, hex * 0.95);
            g.globalAlpha = 1;
        }
    }

    const start = chart.cell(0, 0);
    const [sx, sy] = chart.px(start.x, start.y);
    g.save();
    g.translate(sx, sy);
    g.fillStyle = "rgba(90, 70, 46, .55)";
    g.beginPath();
    for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const r = i % 2 ? hex * 0.15 : hex * 0.52;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
    g.font = `${Math.round(hex * 0.27)}px ${FONT.hand}`;
    g.textAlign = "center";
    g.fillStyle = INK;
    g.fillText("起点", 0, hex * 0.82);
    g.restore();

    if (trail.length > 1) {
        const points = trail.map((p) => {
            const c = chart.cell(p.x, p.y);
            return chart.px(c.x, c.y);
        });
        g.setLineDash([2, hex * 0.15]);
        g.lineCap = "round";
        g.lineWidth = Math.max(5, hex * 0.055);
        g.strokeStyle = INK;
        g.beginPath();
        points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
        g.setLineDash([]);
        g.font = `italic ${Math.round(hex * 0.27)}px ${FONT.latin}`;
        g.fillStyle = INK;
        g.textAlign = "center";
        points.slice(1).forEach(([x, y], i) => g.fillText(roman(i + 1), x + hex * 0.42, y + hex * 0.5));
    }

    for (const [key, action] of Object.entries(mapActions)) {
        const [mx, my] = key.split(",").map(Number);
        const c = chart.cell(mx!, my!);
        const [x, y] = chart.px(c.x, c.y);
        paintMarker(g, x, y - hex * 0.1, hex * 0.36, action, images);
        g.font = `${Math.round(hex * 0.25)}px ${FONT.hand}`;
        g.textAlign = "center";
        g.fillStyle = INK;
        g.fillText(mapLabels[action], x, y + hex * 0.6);
    }

    const label = (text: string, latin: string, kind: Faction) => {
        const cells = chart.layout.cells.filter((cell) => cell.kind === kind);
        const [cx, cy] = chart.px(cells.reduce((s, c) => s + c.x, 0) / cells.length, cells.reduce((s, c) => s + c.y, 0) / cells.length);
        const mid = CHART_PX / 2;
        const away = Math.atan2(cy - mid, cx - mid);
        const x = cx - Math.cos(away) * hex * 1.25;
        const y = cy - Math.sin(away) * hex * 1.25;
        g.save();
        g.translate(x, y);
        g.rotate(kind === "cult" ? 0 : away + Math.PI / 2);
        g.textAlign = "center";
        g.font = `${Math.round(hex * 0.36)}px ${FONT.hand}`;
        g.fillStyle = "#5d4931";
        g.fillText(text, 0, 0);
        if (latin) {
            g.font = `italic ${Math.round(hex * 0.22)}px ${FONT.latin}`;
            g.fillStyle = "#8a7357";
            g.fillText(latin, 0, hex * 0.3);
        }
        g.restore();
    };
    label("海盗湾", "Sinus Piratarum", "pirate");
    label("皇家航道", "Via Regia", "sailor");
    label("克拉肯之喉", "", "cult");
}

/** A map order inked in a parchment roundel; the same disc lifts off the chart when it is triggered. */
export function paintMarker(g: CanvasRenderingContext2D, x: number, y: number, r: number, action: MapAction, images: Art) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = "rgba(244, 233, 206, .94)";
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = Math.max(2.5, r * 0.065);
    g.stroke();
    drawContained(g, images.get(mapActionArt[action]), x, y, r * 1.37);
}

export function markerTexture(action: MapAction, images: Art) {
    const [c, g] = makeCanvas(256);
    paintMarker(g, 128, 128, 120, action, images);
    return canvasTexture(c);
}

export function bezelTexture() {
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
    g.font = `52px ${FONT.plaque}`;
    g.fillStyle = "rgba(60, 42, 12, .9)";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const [deg, text] of [
        [0, "E"],
        [180, "W"],
    ] as const) {
        const a = (deg * Math.PI) / 180;
        g.fillText(text, Math.cos(a) * (inner + 40), Math.sin(a) * (inner + 40));
    }
    return canvasTexture(c);
}

// ── wax, brass and paper pieces ────────────────────────────────────────────

export function sealFace(label: string, dim: boolean) {
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
    g.font = `${label.length > 1 && /\d/.test(label) ? 96 : 112}px ${/\d/.test(label) ? FONT.numeral : FONT.print}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(255, 196, 176, .3)";
    g.fillText(label, 124, 132);
    g.fillStyle = "rgba(48, 6, 4, .92)";
    g.fillText(label, 128, 136);
    return canvasTexture(c);
}

function plaqueBanner(g: CanvasRenderingContext2D, title: string, hint: string | undefined, size: number) {
    const k = size / 1024;
    g.font = `bold ${76 * k}px ${FONT.print}`;
    const w = Math.max(g.measureText(title).width, 360 * k) + 90 * k;
    const grad = g.createLinearGradient(0, 80 * k, 0, 260 * k);
    grad.addColorStop(0, "#f3e5c2");
    grad.addColorStop(1, "#d3b983");
    g.fillStyle = grad;
    g.shadowColor = "rgba(0,0,0,.45)";
    g.shadowBlur = 18 * k;
    g.fillRect(size / 2 - w / 2, 92 * k, w, (hint ? 160 : 120) * k);
    g.shadowBlur = 0;
    g.fillStyle = "#2a1c0d";
    g.textAlign = "center";
    g.fillText(title, size / 2, 182 * k);
    if (hint) {
        g.font = `${38 * k}px ${FONT.print}`;
        g.globalAlpha = 0.75;
        g.fillText(hint, size / 2, 232 * k);
        g.globalAlpha = 1;
    }
}

const CARD_PX = 768;

export function navCardFace(card: NavigationCard, images: Art) {
    const [c, g] = makeCanvas(CARD_PX);
    const img = images.get(navFaceArt[card.direction]);
    if (img) g.drawImage(img, 0, 0, CARD_PX, CARD_PX);
    plaqueBanner(g, effectLabels[card.effect], effectHints[card.effect], CARD_PX);
    return canvasTexture(c);
}

export function ritualFace(kind: CultRitualKind, images: Art) {
    const [c, g] = makeCanvas(CARD_PX);
    const img = images.get(ritualArt[kind]);
    if (img) g.drawImage(img, 0, 0, CARD_PX, CARD_PX);
    plaqueBanner(g, ritualLabels[kind], undefined, CARD_PX);
    return canvasTexture(c);
}

export function cardBack(images: Art, src = art.navBack) {
    const [c, g] = makeCanvas(512);
    const img = images.get(src);
    if (img) g.drawImage(img, 0, 0, 512, 512);
    else {
        g.fillStyle = "#3a2214";
        g.fillRect(0, 0, 512, 512);
    }
    return canvasTexture(c);
}

/** Your identity card: portrait 3:4, the faction's figure over parchment with the role beneath. */
export function identityFace(faction: Faction | undefined, role: Role | undefined, images: Art) {
    const [c, g] = makeCanvas(576, 768);
    const bg = g.createLinearGradient(0, 0, 0, 768);
    bg.addColorStop(0, "#efe0bb");
    bg.addColorStop(1, "#d2b780");
    g.fillStyle = bg;
    g.fillRect(0, 0, 576, 768);
    g.strokeStyle = "rgba(58, 43, 27, .7)";
    g.lineWidth = 6;
    g.strokeRect(22, 22, 532, 724);
    if (faction) {
        g.globalAlpha = 0.95;
        drawContained(g, images.get(factionArt[faction]), 288, 330, 430);
        g.globalAlpha = 1;
    }
    g.textAlign = "center";
    g.fillStyle = "#20170e";
    g.font = `bold 64px ${FONT.print}`;
    g.fillText(roleLabel(role), 288, 640);
    g.font = `34px ${FONT.hand}`;
    g.fillStyle = "#5d4931";
    g.fillText(`${factionLabel(faction)}阵营`, 288, 700);
    return canvasTexture(c);
}

export function secretBack(images: Art) {
    const [c, g] = makeCanvas(576, 768);
    const img = images.get(art.secret);
    if (img) g.drawImage(img, -96, 0, 768, 768);
    else {
        g.fillStyle = "#2a1a10";
        g.fillRect(0, 0, 576, 768);
    }
    return canvasTexture(c);
}

export function coinFace(images: Art) {
    const [c, g] = makeCanvas(256);
    g.fillStyle = "#c9a24b";
    g.fillRect(0, 0, 256, 256);
    drawContained(g, images.get(art.compass), 128, 128, 210);
    return canvasTexture(c);
}

// ── the logbook and the plaque ─────────────────────────────────────────────

const PHASE_LATIN: Partial<Record<Phase, string>> = {
    lobby: "ALL ABOARD",
    officers: "THE APPOINTMENT",
    mutiny: "THE MUTINY",
    mutiny_tiebreak: "THE TIEBREAK",
    captain_nav: "THE CAPTAIN DRAWS",
    mate_nav: "THE MATE DRAWS",
    navigator_nav: "THE NAVIGATOR",
    emergency_navigator: "THE EMERGENCY",
    ended: "LAND HO",
};
const latinOf = (phase: Phase) =>
    PHASE_LATIN[phase] ?? (phase.startsWith("map_") ? "ORDERS OF THE MAP" : phase.startsWith("ritual_") ? "THE RITUAL" : "THE OMEN");

export function paintPlaque(g: CanvasRenderingContext2D, phase: Phase, roundNo: number) {
    const grad = g.createLinearGradient(0, 0, 0, 224);
    grad.addColorStop(0, "#f2db9a");
    grad.addColorStop(0.45, "#c49e48");
    grad.addColorStop(1, "#a37f30");
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 224);
    g.textAlign = "center";
    g.fillStyle = "rgba(48, 32, 8, .9)";
    g.font = `30px ${FONT.plaque}`;
    const latin = phase === "lobby" ? latinOf(phase) : `ROUND ${roman(roundNo).toUpperCase()}  ·  ${latinOf(phase)}`;
    g.fillText(latin.split("").join(" "), 512, 70);
    g.font = `bold 88px ${FONT.print}`;
    const title = phase === "lobby" || phase === "ended" ? phaseLabels[phase] : `第${roundNo}轮 · ${phaseLabels[phase]}`;
    g.fillText(title, 512, 172, 960);
}

/** Lines of CJK or Latin text broken to a width; the last kept line ends in an ellipsis if cut. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
    const lines: string[] = [];
    let line = "";
    for (const ch of text) {
        if (g.measureText(line + ch).width > width && line) {
            lines.push(line);
            line = ch.trim() ? ch : "";
            if (lines.length === maxLines) break;
        } else line += ch;
    }
    if (lines.length < maxLines && line) lines.push(line);
    else if (lines.length === maxLines && line) lines[maxLines - 1] = lines[maxLines - 1]!.slice(0, -1) + "…";
    return lines;
}

function pageBase(g: CanvasRenderingContext2D, rand: () => number) {
    const bg = g.createLinearGradient(0, 0, 1024, 0);
    bg.addColorStop(0, "#e9d8b0");
    bg.addColorStop(1, "#dcc496");
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 1400);
    speckle(g, 1024, 1400, 12, rand);
}

/**
 * The open logbook: the public events of the voyage in a clerk's hand, oldest on the left page.
 * Private knowledge never reaches these pages.
 */
export function paintLogbook(left: CanvasRenderingContext2D, right: CanvasRenderingContext2D, entries: PublicLogEntry[], roundNo: number) {
    pageBase(left, rng(9));
    pageBase(right, rng(10));
    left.fillStyle = "#2a2016";
    left.font = `bold 78px ${FONT.print}`;
    left.textAlign = "left";
    left.fillText("航海日志", 80, 150);
    left.font = `italic 44px ${FONT.latin}`;
    left.fillStyle = "#6b5640";
    left.fillText(`Ship's Log${roundNo ? ` · ${roman(roundNo)}` : ""}`, 600, 146);
    left.fillRect(80, 186, 864, 3);

    type Line = { seq: number; text: string[]; fresh: boolean };
    const lineHeight = 64;
    const tops = [270, 150];
    const room = [1300 - tops[0]!, 1250 - tops[1]!];
    const pages: [Line[], Line[]] = [[], []];
    // Fill from the newest entry backwards, so the latest line always lands on the right-hand page.
    let page = 1;
    left.font = `48px ${FONT.hand}`;
    for (const entry of entries.filter((e) => e.message).slice(-14).reverse()) {
        const line: Line = { seq: entry.seq, text: wrap(left, entry.message, 760, 2), fresh: false };
        const height = line.text.length * lineHeight + 34;
        if (height > room[page]! && page === 1) page = 0;
        if (height > room[page]!) break;
        pages[page].unshift(line);
        room[page]! -= height;
    }
    const newest = pages[1].at(-1) ?? pages[0].at(-1);
    if (newest) newest.fresh = true;

    const write = (g: CanvasRenderingContext2D, lines: Line[], top: number) => {
        let y = top;
        for (const line of lines) {
            g.font = `30px ${FONT.numeral}`;
            g.fillStyle = "#8a7357";
            g.textAlign = "left";
            g.fillText(String(line.seq).padStart(3, "0"), 80, y);
            g.font = `48px ${FONT.hand}`;
            g.fillStyle = line.fresh ? "#140d06" : "#2a2016";
            line.text.forEach((text, i) => g.fillText(text, 170, y + i * lineHeight));
            y += line.text.length * lineHeight + 34;
            g.fillStyle = "rgba(58, 43, 27, .18)";
            g.fillRect(80, y - 40, 864, 2);
        }
    };
    write(left, pages[0], tops[0]!);
    write(right, pages[1], tops[1]!);
    if (!newest) {
        left.font = `48px ${FONT.hand}`;
        left.fillStyle = "#5d4931";
        left.fillText("船还泊在港口，日志尚未落笔。", 80, 300);
    }
    right.font = `30px ${FONT.print}`;
    right.fillStyle = "#8a7357";
    right.textAlign = "left";
    right.fillText("公开记录 · 私密情报不会写进这本日志", 80, 1330);
}

// ── light ──────────────────────────────────────────────────────────────────

export function glowTexture() {
    const [c, g] = makeCanvas(128);
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255, 214, 150, .9)");
    r.addColorStop(0.4, "rgba(255, 190, 110, .35)");
    r.addColorStop(1, "rgba(255, 190, 110, 0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return canvasTexture(c);
}

export function shadowTexture() {
    const [c, g] = makeCanvas(128);
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(0,0,0,.65)");
    r.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
}
