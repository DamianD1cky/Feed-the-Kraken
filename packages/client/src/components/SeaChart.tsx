import { useId } from "react";
import type { PlayerView } from "@feed/shared";
import { mapLabels } from "../labels";
import {
    createSeaChartLayout,
    findChartCell,
    polygonPoints,
} from "./seaChartLayout";

const layouts = {
    quick: createSeaChartLayout("quick"),
    long: createSeaChartLayout("long"),
};

export function SeaChart({ view }: { view: PlayerView }) {
    const titleId = useId();
    const descriptionId = useId();
    const layout = layouts[view.voyageMode];
    const ship = findChartCell(layout, view.ship.x, view.ship.y);
    const start = findChartCell(layout, 0, 0);
    const actions = new Map(
        Object.entries(view.mapActions).map(([coordinate, action]) => {
            const [x, y] = coordinate.split(",").map(Number);
            return [findChartCell(layout, x!, y!).key, action];
        }),
    );

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
            <svg
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                role="img"
                aria-labelledby={`${titleId} ${descriptionId}`}
            >
                <title id={titleId}>
                    六边形航海图，船位 ({view.ship.x}, {view.ship.y})
                </title>
                <desc id={descriptionId}>
                    船从最下方中央格出发。顶部黄色为克拉肯，左上红色为海盗，右上蓝色为水手。标记显示尚未触发的地图行动，航行沿用简化坐标规则。
                </desc>
                <polygon
                    className="chart-frame"
                    points={polygonPoints(layout.frame)}
                />
                {layout.cells.map((cell) => {
                    const action = actions.get(cell.key);
                    return (
                        <g
                            key={cell.key}
                            data-cell-key={cell.key}
                            data-center-x={cell.x}
                            data-center-y={cell.y}
                        >
                            <polygon
                                className={`chart-hex ${cell.kind}${cell.key === ship.key ? " occupied" : ""}`}
                                points={polygonPoints(cell.vertices)}
                                data-start={cell.key === start.key || undefined}
                            />
                            {action && (
                                <text
                                    x={cell.x}
                                    y={cell.y + 6}
                                    textAnchor="middle"
                                    className="map-action"
                                >
                                    {mapLabels[action]}
                                </text>
                            )}
                            {cell.key === start.key && (
                                <text
                                    x={cell.x}
                                    y={cell.y + 42}
                                    textAnchor="middle"
                                    className="map-start"
                                >
                                    起点
                                </text>
                            )}
                            {cell.kind === "cult" && (
                                <text
                                    x={cell.x}
                                    y={
                                        cell.y +
                                        (cell.key === ship.key ? 42 : 6)
                                    }
                                    textAnchor="middle"
                                    className="map-goal"
                                >
                                    克拉肯
                                </text>
                            )}
                        </g>
                    );
                })}
                <g
                    className="ship-marker"
                    data-ship-cell={ship.key}
                    style={{ transform: `translate(${ship.x}px, ${ship.y}px)` }}
                >
                    <circle
                        r="26"
                        fill="#10202c"
                        stroke="#d5b26c"
                        strokeWidth="3"
                    />
                    <path
                        d="M-17 7H17L10 15H-10Z M0 -23V5 M-3 -19L-16 3H-3Z M4 -16L16 3H4Z"
                        fill="#ece3cc"
                        stroke="#ece3cc"
                        strokeWidth="1.5"
                    />
                </g>
            </svg>
            <figcaption>
                <span>
                    船位{" "}
                    <strong>
                        ({view.ship.x}, {view.ship.y})
                    </strong>{" "}
                    · 南端起航
                </span>
                <span>简化海图 · 标记触发后移除</span>
            </figcaption>
        </figure>
    );
}
