import type { VoyageMode } from "@feed/shared";

type PlayableHexKind = "cult" | "pirate" | "sailor" | "path";
type HexKind = PlayableHexKind | "void";
type Point = readonly [number, number];
type HexAddress = readonly [number, number];

type HexCell<K extends HexKind = HexKind> = {
  key: string;
  kind: K;
  i: number;
  j: number;
  cx: number;
  cy: number;
};

type MapPalette = {
  fill: Record<PlayableHexKind, string>;
  stroke: string;
  frame: string;
};

type MapDefinition = {
  id: VoyageMode;
  label: string;
  origin: { x: number; y: number };
  axisLeft: { x: number; y: number };
  axisRight: { x: number; y: number };
  hexSize: number;
  hexRotation: number;
  activeAddresses: ReadonlyArray<HexAddress>;
  framePoints: ReadonlyArray<Point>;
  startAddress: HexAddress;
  victoryDistance: number;
  palette: MapPalette;
};

type MapBoard = {
  definition: MapDefinition;
  activeCells: Array<HexCell<PlayableHexKind>>;
  backgroundCells: Array<HexCell<"void">>;
};

const QUICK_ACTIVE_ADDRESSES: ReadonlyArray<HexAddress> = [
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

const LONG_ACTIVE_ADDRESSES: ReadonlyArray<HexAddress> = [
  ...QUICK_ACTIVE_ADDRESSES,
  [6, 5], [5, 6],
  [6, 6],
];

const QUICK_FRAME_POINTS: ReadonlyArray<Point> = [
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

const LONG_FRAME_POINTS: ReadonlyArray<Point> = [
  [500, 12], [574, 16], [590, 48], [615, 64],
  [657, 80], [699, 96], [744, 128], [767, 144],
  [803, 160], [840, 192], [919, 224], [943, 256],
  [961, 288], [947, 320], [970, 416], [964, 432],
  [949, 480], [922, 512], [894, 560], [881, 592],
  [856, 640], [828, 688], [805, 720], [787, 752],
  [778, 768], [761, 800], [746, 832], [733, 864],
  [714, 896], [686, 928], [644, 960], [612, 976],
  [516, 992], [492, 992], [470, 960], [453, 944],
  [388, 928], [365, 896], [346, 864], [331, 832],
  [330, 768], [328, 752], [275, 736], [247, 720],
  [229, 688], [204, 640], [199, 592], [201, 560],
  [152, 544], [123, 512], [103, 480], [95, 448],
  [93, 416], [95, 384], [95, 352], [92, 320],
  [99, 288], [114, 256], [157, 224], [209, 192],
  [263, 160], [323, 128], [376, 96], [445, 64],
  [478, 32],
];

const MAP_DEFINITIONS: Record<VoyageMode, MapDefinition> = {
  quick: {
    id: "quick",
    label: "快速航行",
    origin: { x: 525.15, y: 174.26 },
    axisLeft: { x: -115.77, y: 63.75 },
    axisRight: { x: 113.33, y: 68.53 },
    hexSize: 76.4,
    hexRotation: 1.16,
    activeAddresses: QUICK_ACTIVE_ADDRESSES,
    framePoints: QUICK_FRAME_POINTS,
    startAddress: [5, 5],
    victoryDistance: 3,
    palette: {
      fill: {
        cult: "#f4b301",
        pirate: "#f73301",
        sailor: "#72b8f4",
        path: "#ddeffb",
      },
      stroke: "#6eb7b6",
      frame: "#32303b",
    },
  },
  long: {
    id: "long",
    label: "漫长航行",
    origin: { x: 525.18, y: 103.61 },
    axisLeft: { x: -115.05, y: 68.26 },
    axisRight: { x: 116.87, y: 64.9 },
    hexSize: 77.2,
    hexRotation: -0.95,
    activeAddresses: LONG_ACTIVE_ADDRESSES,
    framePoints: LONG_FRAME_POINTS,
    startAddress: [6, 6],
    victoryDistance: 4,
    palette: {
      fill: {
        cult: "#f5ad00",
        pirate: "#f62600",
        sailor: "#b1ebf7",
        path: "#edfcff",
      },
      stroke: "#68b7b9",
      frame: "#2b2a30",
    },
  },
};

function pointString(points: ReadonlyArray<Point>) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

function centerAt(definition: MapDefinition, i: number, j: number) {
  return {
    x: definition.origin.x + i * definition.axisLeft.x + j * definition.axisRight.x,
    y: definition.origin.y + i * definition.axisLeft.y + j * definition.axisRight.y,
  };
}

/** 设计稿使用平顶六边形，左右为尖角。 */
function hexPoints(definition: MapDefinition, cx: number, cy: number) {
  const points: Array<[number, number]> = [];
  for (let vertex = 0; vertex < 6; vertex++) {
    const angle = ((definition.hexRotation + vertex * 60) * Math.PI) / 180;
    points.push([
      cx + definition.hexSize * Math.cos(angle),
      cy + definition.hexSize * Math.sin(angle),
    ]);
  }
  return pointString(points);
}

function cellKind(i: number, j: number): PlayableHexKind {
  if (i === 0 && j === 0) return "cult";
  if (j === 0 && i >= 1 && i <= 3) return "pirate";
  if (i === 0 && j >= 1 && j <= 3) return "sailor";
  return "path";
}

function createCell<K extends HexKind>(
  definition: MapDefinition,
  i: number,
  j: number,
  kind: K,
): HexCell<K> {
  const center = centerAt(definition, i, j);
  return {
    key: `${kind}-${i}-${j}`,
    kind,
    i,
    j,
    cx: center.x,
    cy: center.y,
  };
}

const NEIGHBOR_OFFSETS: ReadonlyArray<HexAddress> = [
  [1, 0], [-1, 0],
  [0, 1], [0, -1],
  [1, -1], [-1, 1],
];

function createBoard(definition: MapDefinition): MapBoard {
  const activeCells = definition.activeAddresses
    .map(([i, j]) => createCell(definition, i, j, cellKind(i, j)));
  const activeAddressKeys = new Set(
    definition.activeAddresses.map(([i, j]) => `${i},${j}`),
  );
  const backgroundAddresses = new Map<string, HexAddress>();

  for (const [i, j] of definition.activeAddresses) {
    for (const [di, dj] of NEIGHBOR_OFFSETS) {
      const neighbor: HexAddress = [i + di, j + dj];
      const key = `${neighbor[0]},${neighbor[1]}`;
      if (!activeAddressKeys.has(key)) {
        backgroundAddresses.set(key, neighbor);
      }
    }
  }

  return {
    definition,
    activeCells,
    backgroundCells: [...backgroundAddresses.values()]
      .map(([i, j]) => createCell(definition, i, j, "void")),
  };
}

const MAP_BOARDS: Record<VoyageMode, MapBoard> = {
  quick: createBoard(MAP_DEFINITIONS.quick),
  long: createBoard(MAP_DEFINITIONS.long),
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexDistance(a: HexAddress, b: HexAddress) {
  const di = a[0] - b[0];
  const dj = a[1] - b[1];
  return (Math.abs(di) + Math.abs(dj) + Math.abs(di + dj)) / 2;
}

function findShipCell(board: MapBoard, x: number, y: number) {
  const { definition, activeCells } = board;
  let address: HexAddress;
  if (y >= definition.victoryDistance) {
    address = [0, 0];
  } else if (x >= definition.victoryDistance) {
    address = [0, clamp(definition.victoryDistance - y, 1, 3)];
  } else if (x <= -definition.victoryDistance) {
    address = [clamp(definition.victoryDistance - y, 1, 3), 0];
  } else {
    address = [
      definition.startAddress[0] - y - Math.max(x, 0),
      definition.startAddress[1] - y + Math.min(x, 0),
    ];
  }

  const exact = activeCells.find((cell) => cell.i === address[0] && cell.j === address[1]);
  if (exact) return exact;

  return activeCells.reduce((best, cell) => {
    const currentDistance = hexDistance([cell.i, cell.j], address);
    const bestDistance = hexDistance([best.i, best.j], address);
    return currentDistance < bestDistance ? cell : best;
  });
}

type HexMapProps = {
  x: number;
  y: number;
  voyageMode: VoyageMode;
};

export function HexMap({ x, y, voyageMode }: HexMapProps) {
  const board = MAP_BOARDS[voyageMode];
  const { definition, activeCells, backgroundCells } = board;
  const ship = findShipCell(board, x, y);
  const framePoints = pointString(definition.framePoints);
  const titleId = `${definition.id}-map-title`;
  const clipId = `${definition.id}-map-frame`;

  return (
    <div className="hex-map" aria-label={`${definition.label}海图`}>
      <svg
        className="hex-map-svg"
        viewBox="0 0 1024 1024"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{definition.label}海图</title>
        <defs>
          <clipPath id={clipId}>
            <polygon points={framePoints} />
          </clipPath>
        </defs>

        <polygon points={framePoints} fill={definition.palette.frame} />
        <g clipPath={`url(#${clipId})`}>
          {backgroundCells.map((cell) => (
            <polygon
              key={cell.key}
              points={hexPoints(definition, cell.cx, cell.cy)}
              fill={definition.palette.frame}
              stroke={definition.palette.stroke}
              strokeWidth="3"
            />
          ))}
        </g>

        {activeCells.map((cell) => (
          <polygon
            key={cell.key}
            className={cell === ship ? "hex-cell current" : "hex-cell"}
            points={hexPoints(definition, cell.cx, cell.cy)}
            fill={definition.palette.fill[cell.kind]}
            stroke={definition.palette.stroke}
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
        <span><i className="swatch" style={{ backgroundColor: definition.palette.fill.cult }} />克拉肯</span>
        <span><i className="swatch" style={{ backgroundColor: definition.palette.fill.pirate }} />海盗</span>
        <span><i className="swatch" style={{ backgroundColor: definition.palette.fill.sailor }} />水手</span>
        <span className="muted">位置 ({x}, {y})</span>
      </div>
    </div>
  );
}
