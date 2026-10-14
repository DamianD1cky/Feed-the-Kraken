// Helpers for the 海图桌 prototype pages. Plain ES module, no build step beyond Vite's dev server.

export function rng(seed = 1) {
    let s = (seed >>> 0) || 1;
    return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 4294967296;
    };
}

const fixed = (n) => n.toFixed(1);

/** A wax seal with a slightly irregular edge, a pressed ring and an embossed label. */
export function waxSeal(label, { size = 56, seed = 1, dim = false } = {}) {
    const r = size / 2;
    const random = rng(seed * 7919);
    const points = Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        const wobble = 1 + 0.04 * Math.sin(a * 3 + seed) + (random() - 0.5) * 0.08;
        return [r + (r - 2.5) * wobble * Math.cos(a), r + (r - 2.5) * wobble * Math.sin(a)];
    });
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let d = `M ${mid(points[19], points[0]).map(fixed).join(" ")}`;
    points.forEach((p, i) => {
        const m = mid(p, points[(i + 1) % points.length]);
        d += ` Q ${fixed(p[0])} ${fixed(p[1])} ${fixed(m[0])} ${fixed(m[1])}`;
    });
    const id = `wax-${seed}-${dim ? "d" : "r"}`;
    const [hi, mid1, lo] = dim ? ["#9a918a", "#625b55", "#3a3532"] : ["#d6604f", "#972420", "#561210"];
    const font = Math.round(size * 0.4);
    return `<svg class="seal" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
  <defs><radialGradient id="${id}" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="${hi}"/><stop offset=".48" stop-color="${mid1}"/><stop offset="1" stop-color="${lo}"/></radialGradient></defs>
  <path d="${d}" fill="url(#${id})"/>
  <circle cx="${r}" cy="${r}" r="${fixed(r * 0.66)}" fill="none" stroke="rgba(30,4,3,.45)" stroke-width="1.8"/>
  <circle cx="${fixed(r - 0.7)}" cy="${fixed(r - 0.9)}" r="${fixed(r * 0.66)}" fill="none" stroke="rgba(255,200,180,.28)" stroke-width="0.9"/>
  <text x="${fixed(r - 0.7)}" y="${fixed(r + font * 0.34 - 0.8)}" text-anchor="middle" font-size="${font}" class="seal-num seal-num-hi">${label}</text>
  <text x="${r}" y="${fixed(r + font * 0.34)}" text-anchor="middle" font-size="${font}" class="seal-num">${label}</text>
</svg>`;
}

/** Flat-top hex cells of the quick / long chart, origin at the start cell (0,0). Same shape as seaChartLayout.ts. */
export function hexCells(distance, radius) {
    const rowHeight = Math.sqrt(3) * radius;
    const depth = distance * 2 - 1;
    const cells = [];
    for (let column = -distance; column <= distance; column++) {
        const inset = Math.abs(column);
        const firstRow = inset === distance ? 1 : 0;
        const lastRow = depth - inset;
        for (let row = firstRow; row <= lastRow; row++) {
            const kind = row !== lastRow ? "water" : column < 0 ? "pirate" : column > 0 ? "sailor" : "cult";
            cells.push({ key: `${column}:${row}`, column, row, kind, x: column * radius * 1.5, y: -(row + inset / 2) * rowHeight });
        }
    }
    return cells;
}

export function hexPoints(x, y, radius) {
    return Array.from({ length: 6 }, (_, i) => {
        const a = (i * Math.PI) / 3;
        return `${fixed(x + radius * Math.cos(a))},${fixed(y + radius * Math.sin(a))}`;
    }).join(" ");
}

export const polar = (cx, cy, r, degrees) => {
    const a = (degrees * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
