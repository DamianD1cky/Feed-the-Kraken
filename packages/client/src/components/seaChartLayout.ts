import { boardCells, victoryDistance, type BoardCellKind, type VoyageMode } from "@feed/shared";

type Point = { x: number; y: number };

export type ChartCell = Point & {
  key: string;
  column: number;
  row: number;
  kind: BoardCellKind;
  vertices: Point[];
};

export const HEX_RADIUS = 56;
const ROW_HEIGHT = Math.sqrt(3) * HEX_RADIUS;
const PADDING = 40;

/** 把共享规则里的棋盘格换算成平顶六边形的像素位置；规则与画面共用同一份格子定义。 */
export function createSeaChartLayout(mode: VoyageMode) {
  const distance = victoryDistance(mode);
  const depth = distance * 2 - 1;
  const centerX = (distance * 1.5 + 1) * HEX_RADIUS + PADDING;
  const startY = HEX_RADIUS + PADDING + depth * ROW_HEIGHT;
  const cells: ChartCell[] = boardCells(mode).map(({ x: column, y: row, kind }) => {
    const x = centerX + column * HEX_RADIUS * 1.5;
    const y = startY - (row + Math.abs(column) / 2) * ROW_HEIGHT;
    return {
      key: `${column},${row}`,
      column, row, kind, x, y,
      vertices: Array.from({ length: 6 }, (_, vertex) => {
        const angle = vertex * Math.PI / 3;
        return { x: x + HEX_RADIUS * Math.cos(angle), y: y + HEX_RADIUS * Math.sin(angle) };
      }),
    };
  });

  return {
    cells,
    width: centerX * 2,
    height: startY + ROW_HEIGHT / 2 + PADDING,
    frame: convexHull(cells.flatMap((cell) => cell.vertices)),
  };
}

export type SeaChartLayout = ReturnType<typeof createSeaChartLayout>;

export function findChartCell(layout: SeaChartLayout, x: number, y: number): ChartCell {
  const cell = layout.cells.find((item) => item.column === x && item.row === y);
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
