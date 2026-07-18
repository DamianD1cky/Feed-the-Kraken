import type { VoyageMode } from "@feed/shared";

type HexKind = "cult" | "pirate" | "sailor" | "path" | "void";

type HexCell = {
  key: string;
  kind: HexKind;
  i: number;
  j: number;
  cx: number;
  cy: number;
};

const FILL: Record<Exclude<HexKind, "void">, string> = {
  cult: "#f4b301",
  pirate: "#f73301",
  sailor: "#72b8f4",
  path: "#ddeffb",
};

const STROKE = "#6eb7b6";
const VOID_FILL = "#32303b";
const FRAME = "#32303b";

const ORIGIN = { x: 525.15, y: 174.26 };
const AXIS_LEFT = { x: -115.77, y: 63.75 };
const AXIS_RIGHT = { x: 113.33, y: 68.53 };
const HEX_SIZE = 76.4;
const HEX_ROTATION = 1.16;

const ACTIVE_ADDRESSES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0], [0, 1],
  [2, 0], [1, 1], [0, 2],
  [3, 0], [2, 1], [1, 2], [0, 3],
  [3, 1], [2, 2], [1, 3],
  [4, 1], [3, 2], [2, 3], [1, 4],
  [4, 2], [3, 3], [2, 4],
  [4, 3], [3, 4],
  [5, 3], [4, 4], [3, 5],
  [5, 4], [4, 5],
  [5, 5],
];

const FRAME_POINTS: ReadonlyArray<readonly [number, number]> = [
  [570, 64],
  [608, 88], [656, 120], [704, 152], [752, 184],
  [798, 216], [845, 248], [892, 280], [947, 316],
  [959, 501],
  [948, 520], [920, 568], [894, 616], [870, 664],
  [848, 712], [817, 781], [772, 808], [711, 840],
  [651, 872], [590, 904], [529, 936], [514, 944],
  [503, 936], [450, 904], [393, 872], [331, 840],
  [267, 808], [229, 781], [189, 712], [160, 648],
  [129, 584], [93, 520], [77, 503],
  [81, 319],
  [115, 296], [139, 280], [165, 264], [192, 248],
  [220, 232], [247, 216], [277, 200], [307, 184],
  [338, 168], [369, 152], [403, 136], [438, 120],
  [474, 104], [511, 88], [550, 72],
];

function pointString(points: ReadonlyArray<readonly [number, number]>) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

function centerAt(i: number, j: number) {
  return {
    x: ORIGIN.x + i * AXIS_LEFT.x + j * AXIS_RIGHT.x,
    y: ORIGIN.y + i * AXIS_LEFT.y + j * AXIS_RIGHT.y,
  };
}

/** 设计稿使用平顶六边形，左右为尖角。 */
function hexPoints(cx: number, cy: number, size = HEX_SIZE) {
  const points: Array<[number, number]> = [];
  for (let vertex = 0; vertex < 6; vertex++) {
    const angle = ((HEX_ROTATION + vertex * 60) * Math.PI) / 180;
    points.push([
      cx + size * Math.cos(angle),
      cy + size * Math.sin(angle),
    ]);
  }
  return pointString(points);
}

function cellKind(i: number, j: number): Exclude<HexKind, "void"> {
  if (i === 0 && j === 0) return "cult";
  if (j === 0 && i >= 1 && i <= 3) return "pirate";
  if (i === 0 && j >= 1 && j <= 3) return "sailor";
  return "path";
}

function createCell(i: number, j: number, kind: HexKind): HexCell {
  const center = centerAt(i, j);
  return {
    key: `${kind}-${i}-${j}`,
    kind,
    i,
    j,
    cx: center.x,
    cy: center.y,
  };
}

const ACTIVE_CELLS = ACTIVE_ADDRESSES.map(([i, j]) => createCell(i, j, cellKind(i, j)));

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0],
  [0, 1], [0, -1],
  [1, -1], [-1, 1],
];

const activeAddressKeys = new Set(
  ACTIVE_ADDRESSES.map(([i, j]) => `${i},${j}`),
);
const backgroundAddresses = new Map<string, readonly [number, number]>();

for (const [i, j] of ACTIVE_ADDRESSES) {
  for (const [di, dj] of NEIGHBOR_OFFSETS) {
    const neighbor: readonly [number, number] = [i + di, j + dj];
    const key = `${neighbor[0]},${neighbor[1]}`;
    if (!activeAddressKeys.has(key)) {
      backgroundAddresses.set(key, neighbor);
    }
  }
}

const BACKGROUND_CELLS = [...backgroundAddresses.values()]
  .map(([i, j]) => createCell(i, j, "void"));

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function findShipCell(x: number, y: number) {
  let address: readonly [number, number];
  if (y >= 3) {
    address = [0, 0];
  } else if (x >= 3) {
    address = [0, clamp(3 - y, 1, 3)];
  } else if (x <= -3) {
    address = [clamp(3 - y, 1, 3), 0];
  } else {
    address = [
      5 - y - Math.max(x, 0),
      5 - y + Math.min(x, 0),
    ];
  }

  const exact = ACTIVE_CELLS.find((cell) => cell.i === address[0] && cell.j === address[1]);
  if (exact) return exact;

  return ACTIVE_CELLS.reduce((best, cell) => {
    const currentDistance = Math.abs(cell.i - address[0]) + Math.abs(cell.j - address[1]);
    const bestDistance = Math.abs(best.i - address[0]) + Math.abs(best.j - address[1]);
    return currentDistance < bestDistance ? cell : best;
  });
}

type HexMapProps = {
  x: number;
  y: number;
  voyageMode: VoyageMode;
};

export function HexMap({ x, y, voyageMode }: HexMapProps) {
  const ship = findShipCell(x, y);
  const framePoints = pointString(FRAME_POINTS);

  return (
    <div className="hex-map" aria-label="快速航行海图">
      <svg
        className="hex-map-svg"
        viewBox="0 0 1024 1024"
        role="img"
        aria-labelledby="quick-map-title"
      >
        <title id="quick-map-title">快速航行海图</title>
        <defs>
          <clipPath id="quick-map-frame">
            <polygon points={framePoints} />
          </clipPath>
        </defs>

        <polygon points={framePoints} fill={FRAME} />
        <g clipPath="url(#quick-map-frame)">
          {BACKGROUND_CELLS.map((cell) => (
            <polygon
              key={cell.key}
              points={hexPoints(cell.cx, cell.cy)}
              fill={VOID_FILL}
              stroke={STROKE}
              strokeWidth="3"
            />
          ))}
        </g>

        {ACTIVE_CELLS.map((cell) => (
          <polygon
            key={cell.key}
            className={cell === ship ? "hex-cell current" : "hex-cell"}
            points={hexPoints(cell.cx, cell.cy)}
            fill={FILL[cell.kind as Exclude<HexKind, "void">]}
            stroke={STROKE}
            strokeWidth="3.2"
          />
        ))}
        <text
          className="hex-ship"
          x={ship.cx}
          y={ship.cy + 12}
          textAnchor="middle"
          fontSize="72"
        >
          ⛵
        </text>
      </svg>
      <div className="hex-map-legend">
        <span><i className="swatch cult" />克拉肯</span>
        <span><i className="swatch pirate" />海盗</span>
        <span><i className="swatch sailor" />水手</span>
        <span className="muted">
          {voyageMode === "long" ? "漫长模式暂用快速海图 · " : ""}
          位置 ({x}, {y})
        </span>
      </div>
    </div>
  );
}
