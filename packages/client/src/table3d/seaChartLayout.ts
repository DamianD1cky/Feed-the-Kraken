import { victoryDistance, type VoyageMode } from "@feed/shared";

type Point = { x: number; y: number };
type HexKind = "water" | "pirate" | "sailor" | "cult";

export type ChartCell = Point & {
  key: string;
  column: number;
  row: number;
  kind: HexKind;
  vertices: Point[];
};

const RADIUS = 56;
const ROW_HEIGHT = Math.sqrt(3) * RADIUS;
const PADDING = 32;

/** 参考图的平顶六边形：中央六格，两侧依次五、四、两格。 */
export function createSeaChartLayout(mode: VoyageMode) {
  const distance = victoryDistance(mode);
  const depth = distance * 2 - 1;
  const centerX = (distance * 1.5 + 1) * RADIUS + PADDING;
  const startY = RADIUS + PADDING + depth * ROW_HEIGHT;
  const cells: ChartCell[] = [];

  for (let column = -distance; column <= distance; column++) {
    const inset = Math.abs(column);
    // 最外侧下方收一格，形成参考图的收拢轮廓；底端仅留中央起点。
    const firstRow = inset === distance ? 1 : 0;
    const lastRow = depth - inset;
    for (let row = firstRow; row <= lastRow; row++) {
      const x = centerX + column * RADIUS * 1.5;
      const y = startY - (row + inset / 2) * ROW_HEIGHT;
      const kind: HexKind = row !== lastRow ? "water" : column < 0 ? "pirate" : column > 0 ? "sailor" : "cult";
      cells.push({
        key: `${column}:${row}`,
        column, row, kind, x, y,
        vertices: Array.from({ length: 6 }, (_, vertex) => {
          const angle = vertex * Math.PI / 3;
          return { x: x + RADIUS * Math.cos(angle), y: y + RADIUS * Math.sin(angle) };
        }),
      });
    }
  }

  return {
    distance, depth, cells,
    width: centerX * 2,
    height: startY + ROW_HEIGHT / 2 + PADDING,
    frame: convexHull(cells.flatMap((cell) => cell.vertices)),
  };
}

export type SeaChartLayout = ReturnType<typeof createSeaChartLayout>;

/**
 * 现有简化坐标在水域中逐一对应格子，(0,0) 固定为最下方中央格。
 * 终点映射到对应颜色的上缘；这里仅负责显示，不改变服务端航行规则。
 */
export function findChartCell(layout: SeaChartLayout, x: number, y: number): ChartCell {
  const { distance, depth } = layout;
  let column = x;
  let row = y;
  if (Math.abs(x) >= distance) {
    column = Math.sign(x) * (distance - Math.min(y, distance - 1));
    row = depth - Math.abs(column);
  } else if (y >= distance) {
    column = 0;
    row = depth;
  }
  const cell = layout.cells.find((item) => item.column === column && item.row === row);
  if (!cell) throw new Error(`海图不存在坐标 (${x}, ${y})`);
  return cell;
}

export function polygonPoints(points: Point[]) {
  return points.map(({ x, y }) => `${x},${y}`).join(" ");
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (items: Point[]) => {
    const hull: Point[] = [];
    for (const point of items) {
      while (hull.length >= 2 && cross(hull[hull.length - 2]!, hull[hull.length - 1]!, point) <= 0) hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}
