import { useId } from "react";
import type { MapAction, PlayerView } from "@feed/shared";
import { art, identityArt, mapLabels, modelArt } from "../labels";
import { createSeaChartLayout, findChartCell, HEX_RADIUS, polygonPoints, type ChartCell } from "./seaChartLayout";

const layouts = {
    quick: createSeaChartLayout("quick"),
    long: createSeaChartLayout("long"),
};

const HEX_HEIGHT = Math.sqrt(3) * HEX_RADIUS;

/** 地图行动标记：搜查与献祭使用模型渲染图，其余沿用物品美术。 */
const actionArt: Record<MapAction, { src: string; width: number }> = {
    cabin_search: { src: modelArt.magnifier, width: 62 },
    feed_kraken: { src: modelArt.tentacleFeed, width: 74 },
    flogging: { src: art.lash, width: 50 },
    tongue: { src: art.knife, width: 50 },
};

export function SeaChart({ view }: { view: PlayerView }) {
    const uid = useId().replace(/:/g, "");
    const titleId = `${uid}-title`;
    const descriptionId = `${uid}-desc`;
    const layout = layouts[view.voyageMode];
    const ship = findChartCell(layout, view.ship.x, view.ship.y);
    const start = findChartCell(layout, 0, 0);
    const actions = new Map(
        Object.entries(view.mapActions).map(([coordinate, action]) => {
            const [x, y] = coordinate.split(",").map(Number);
            return [findChartCell(layout, x!, y!).key, action];
        }),
    );
    const ids = {
        waves: `${uid}-waves`,
        hatch: `${uid}-hatch`,
        swell: `${uid}-swell`,
        glow: `${uid}-glow`,
        hex: `${uid}-hex`,
        shadow: `${uid}-shadow`,
    };

    return (
        <figure className="sea-chart">
            <div className="chart-legend" aria-label="目的地">
                <span>
                    <i className="pirate" />西 · 海盗
                </span>
                <span>
                    <i className="cult" />北 · 克拉肯
                </span>
                <span>
                    <i className="sailor" />东 · 水手
                </span>
            </div>
            <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
                <title id={titleId}>
                    六边形航海图，船位 ({view.ship.x}, {view.ship.y})
                </title>
                <desc id={descriptionId}>
                    船从最下方中央格出发。左上红色为海盗终点，右上蓝色为水手终点，最北的黄色为克拉肯。触手标记献祭格，放大镜标记搜查格，标记触发后移除。
                </desc>
                <defs>
                    <pattern id={ids.waves} width="28" height="14" patternUnits="userSpaceOnUse">
                        <path d="M0 9 Q7 4 14 9 T28 9" className="chart-waves" />
                    </pattern>
                    <pattern id={ids.hatch} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
                        <line x1="0" y1="0" x2="0" y2="9" className="chart-hatch" />
                    </pattern>
                    <pattern id={ids.swell} width="22" height="12" patternUnits="userSpaceOnUse">
                        <path d="M0 8 Q5.5 3 11 8 T22 8" className="chart-swell" />
                    </pattern>
                    <radialGradient id={ids.glow}>
                        <stop offset="0" stopColor="#f6d97e" />
                        <stop offset="1" stopColor="#c9952f" />
                    </radialGradient>
                    <clipPath id={ids.hex} clipPathUnits="objectBoundingBox">
                        <polygon points="0.25,0 0.75,0 1,0.5 0.75,1 0.25,1 0,0.5" />
                    </clipPath>
                    <filter id={ids.shadow} x="-30%" y="-30%" width="160%" height="160%">
                        <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#081018" floodOpacity="0.55" />
                    </filter>
                </defs>

                <polygon className="chart-frame" points={polygonPoints(layout.frame)} />
                <polygon className="chart-frame-line" points={polygonPoints(layout.frame)} />

                {layout.cells.map((cell) => (
                    <HexCell
                        key={cell.key}
                        cell={cell}
                        ids={ids}
                        occupied={cell.key === ship.key}
                        isStart={cell.key === start.key}
                        action={actions.get(cell.key)}
                    />
                ))}

                <g
                    className="ship-marker"
                    data-ship-cell={ship.key}
                    style={{ transform: `translate(${ship.x}px, ${ship.y}px)` }}
                >
                    <ellipse className="ship-wake" cx="0" cy="22" rx="30" ry="8" />
                    <image
                        className="ship-sprite"
                        href={modelArt.ship}
                        x={-40}
                        y={-50}
                        width={80}
                        height={76}
                        filter={`url(#${ids.shadow})`}
                    />
                </g>
            </svg>
            <figcaption>
                <span>
                    船位{" "}
                    <strong>
                        ({view.ship.x}, {view.ship.y})
                    </strong>
                </span>
                <span>默认六边形航线 · 标记触发后移除</span>
            </figcaption>
        </figure>
    );
}

function HexCell({
    cell,
    ids,
    occupied,
    isStart,
    action,
}: {
    cell: ChartCell;
    ids: Record<"waves" | "hatch" | "swell" | "glow" | "hex" | "shadow", string>;
    occupied: boolean;
    isStart: boolean;
    action?: MapAction;
}) {
    const points = polygonPoints(cell.vertices);
    const box = { x: cell.x - HEX_RADIUS, y: cell.y - HEX_HEIGHT / 2, width: HEX_RADIUS * 2, height: HEX_HEIGHT };
    const texture = { water: ids.waves, pirate: ids.hatch, sailor: ids.swell, cult: undefined }[cell.kind];
    const emblem = cell.kind === "pirate" ? identityArt.pirate : cell.kind === "sailor" ? identityArt.sailor : undefined;
    const marker = action ? actionArt[action] : undefined;

    return (
        <g className={`chart-cell ${cell.kind}${occupied ? " occupied" : ""}`} data-cell-key={cell.key} data-center-x={cell.x} data-center-y={cell.y}>
            <polygon
                className="chart-hex"
                points={points}
                style={cell.kind === "cult" ? { fill: `url(#${ids.glow})` } : undefined}
            />
            {texture && <polygon className="chart-texture" points={points} fill={`url(#${texture})`} />}
            {emblem && (
                <image
                    className="chart-emblem"
                    href={emblem}
                    {...box}
                    preserveAspectRatio="xMidYMid meet"
                    clipPath={`url(#${ids.hex})`}
                />
            )}
            {cell.kind === "cult" && (
                <image
                    className="chart-model is-sway"
                    href={modelArt.tentacleGoal}
                    x={cell.x - 44}
                    y={cell.y - 46}
                    width={88}
                    height={84}
                    filter={`url(#${ids.shadow})`}
                />
            )}
            <polygon className="chart-outline" points={points} />
            {marker && action && (
                <g className="chart-action">
                    <image
                        className={`chart-model${action === "feed_kraken" ? " is-sway" : ""}`}
                        href={marker.src}
                        x={cell.x - marker.width / 2}
                        y={cell.y - marker.width / 2 - 8}
                        width={marker.width}
                        height={marker.width}
                        filter={`url(#${ids.shadow})`}
                    />
                    <text className="chart-label" x={cell.x} y={cell.y + 38} textAnchor="middle">
                        {mapLabels[action]}
                    </text>
                </g>
            )}
            {isStart && !occupied && (
                <text className="chart-label is-start" x={cell.x} y={cell.y + 6} textAnchor="middle">
                    起点
                </text>
            )}
        </g>
    );
}
