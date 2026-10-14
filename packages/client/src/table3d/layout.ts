import * as THREE from "three";
import type { Direction, VoyageMode } from "@feed/shared";
import { createSeaChartLayout, findChartCell, HEX_RADIUS, type ChartCell, type SeaChartLayout } from "./seaChartLayout";

/**
 * Where things lie on the table, in table units: y is up, +z points at the viewer's chair.
 * The chart sits left of centre so the logbook fits on the right; your cards lie at the near edge.
 */
export const CHART = new THREE.Vector3(-1.9, 0, -0.55);
export const DISC_R = 3;
export const BEZEL_R = 3.55;
export const BEZEL_TOP = 0.13;
export const SEAT_R = 3.28;
export const CHART_Y = 0.07;
/** Side of the chart's canvas texture, in pixels. */
export const CHART_PX = 2048;

export const SPOTS = {
    hand: [new THREE.Vector3(0.75, 0.02, 3.9), new THREE.Vector3(2.2, 0.02, 3.82)],
    dossier: new THREE.Vector3(-0.6, 0.02, 4.0),
    deck: new THREE.Vector3(2.35, 0, -3.95),
    /** The last route played, face up beside the deck it came from. */
    reveal: new THREE.Vector3(3.95, 0.02, -3.55),
    book: new THREE.Vector3(5.3, 0, -0.95),
    candle: new THREE.Vector3(-6.2, 0, -3.3),
    pistol: new THREE.Vector3(-5.3, 0, 3.0),
    /** Past the far edge of the table, where discarded cards sink. */
    deep: new THREE.Vector3(-1.4, -0.6, -9.5),
};
export const REVEAL_YAW = 0.1;

export type Chart = {
    mode: VoyageMode;
    layout: SeaChartLayout;
    /** A hex's radius on the canvas. */
    hexPx: number;
    /** Canvas pixel of a layout point. */
    px(x: number, y: number): [number, number];
    cell(x: number, y: number): ChartCell;
    /** Table position of a game coordinate, `lift` above the paper. */
    at(x: number, y: number, lift?: number): THREE.Vector3;
    /** Table position of a layout point. */
    point(x: number, y: number, lift?: number): THREE.Vector3;
};

const charts = new Map<VoyageMode, Chart>();

/** The server's hex layout fitted inside the brass ring, shared by the chart texture and the ship. */
export function chartOf(mode: VoyageMode): Chart {
    const known = charts.get(mode);
    if (known) return known;
    const layout = createSeaChartLayout(mode);
    const xs = layout.frame.map((p) => p.x);
    const ys = layout.frame.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const reach = Math.max(...layout.frame.map((p) => Math.hypot(p.x - cx, p.y - cy)));
    const units = (DISC_R - 0.36) / reach;
    const pxPerUnit = CHART_PX / 2 / DISC_R;
    const point = (x: number, y: number, lift = 0) => new THREE.Vector3(CHART.x + (x - cx) * units, CHART_Y + lift, CHART.z + (y - cy) * units);
    const chart: Chart = {
        mode,
        layout,
        hexPx: HEX_RADIUS * units * pxPerUnit,
        px: (x, y) => [CHART_PX / 2 + (x - cx) * units * pxPerUnit, CHART_PX / 2 + (y - cy) * units * pxPerUnit],
        cell: (x, y) => findChartCell(layout, x, y),
        at: (x, y, lift = 0) => {
            const c = findChartCell(layout, x, y);
            return point(c.x, c.y, lift);
        },
        point,
    };
    charts.set(mode, chart);
    return chart;
}

/** You sit at the near side; everyone else follows clockwise in seat order. */
export const seatAngle = (index: number, count: number, viewer: number) =>
    Math.PI / 2 + ((((index - viewer) % count) + count) % count) * ((2 * Math.PI) / count);

export const onRing = (angle: number, radius: number, y = 0) =>
    new THREE.Vector3(CHART.x + Math.cos(angle) * radius, y, CHART.z + Math.sin(angle) * radius);

export type Side = "left" | "right" | "below" | "above";

/** Name slips go beside their seal on the outer side; the nearest and farthest seals get theirs below or above. */
export function sideOf(angle: number): Side {
    const c = Math.cos(angle);
    return c > 0.25 ? "right" : c < -0.25 ? "left" : Math.sin(angle) > 0 ? "below" : "above";
}

const SLIP_DIRECTION: Record<Side, [number, number]> = { right: [1, 0], left: [-1, 0], below: [0, 1], above: [0, -1] };

/** The phase plaque stands just past the far side of the ring; nothing may be set down under it. */
export const PLAQUE_AT = new THREE.Vector3(CHART.x, BEZEL_TOP + 0.04, CHART.z - BEZEL_R - 0.05);
const underPlaque = (p: THREE.Vector3) => Math.abs(p.x - PLAQUE_AT.x) < 1.8 && Math.abs(p.z - PLAQUE_AT.z) < 0.68;

/**
 * A seat's things lie in the gaps beside its seal, clear of the side its name slip covers:
 * offices and the cards it holds on the clearer side, the mug and the knife on the other.
 */
export type Slot = "office" | "held" | "mug" | "knife";
export function slotOf(angle: number, count: number, slot: Slot) {
    const along = Math.min(0.36 * ((2 * Math.PI) / count), 0.34);
    const [dx, dz] = SLIP_DIRECTION[sideOf(angle)];
    const towardSlip = (a: number) => (Math.cos(a) - Math.cos(angle)) * dx + (Math.sin(a) - Math.sin(angle)) * dz;
    const clear = towardSlip(angle + along) <= towardSlip(angle - along) ? 1 : -1;
    const side = slot === "office" || slot === "held" ? clear : -clear;
    const out = slot === "office" || slot === "mug" ? 0.5 : 1.08;
    const at = onRing(angle + side * along, SEAT_R + out, 0);
    if (!underPlaque(at)) return at;
    const other = onRing(angle - side * along, SEAT_R + out, 0);
    return underPlaque(other) ? onRing(angle + side * along, SEAT_R + out + 0.8, 0) : other;
}

/** The ship model's bow points along its local −x. */
export const headingYaw: Record<Direction, number> = { west: 0, east: Math.PI, north: -Math.PI / 2 };
