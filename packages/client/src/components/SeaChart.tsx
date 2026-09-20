import { victoryDistance, type PlayerView } from "@feed/shared";
import { mapLabels } from "../labels";

/** 每个坐标唯一对应一个节点；不把简化状态吸附到原版地图的最近格。 */
export function SeaChart({ view }: { view: PlayerView }) {
  const distance = victoryDistance(view.voyageMode);
  const px = (x: number) => 360 + (x / distance) * 275;
  const py = (y: number) => 380 - (y / distance) * 280;
  const columns = Array.from({ length: distance * 2 + 1 }, (_, index) => index - distance);
  const rows = Array.from({ length: distance + 1 }, (_, index) => index);
  return (
    <figure className="sea-chart">
      <svg viewBox="0 0 720 460" role="img" aria-labelledby="chart-title chart-desc">
        <title id="chart-title">航海图，船位 ({view.ship.x}, {view.ship.y})</title>
        <desc id="chart-desc">简化坐标海图。向西到负 {distance} 海盗获胜，向东到 {distance} 水手获胜，向北到 {distance} 邪教获胜。标记显示尚未触发的地图行动。</desc>
        <defs><radialGradient id="sea"><stop stopColor="#24434a" /><stop offset="1" stopColor="#11272c" /></radialGradient></defs>
        <rect x="12" y="12" width="696" height="436" rx="4" fill="url(#sea)" stroke="#668079" strokeOpacity=".3" />
        <circle cx="360" cy="248" r="172" fill="none" stroke="#7c9a8a" opacity=".13" />
        <circle cx="360" cy="248" r="132" fill="none" stroke="#7c9a8a" opacity=".13" />
        <path d="M360 28V431 M30 248H690 M205 93L515 403 M205 403L515 93" stroke="#7c9a8a" opacity=".13" />
        <text x="360" y="50" textAnchor="middle" className="map-destination cult">北 / 克拉肯</text>
        <text x="86" y="64" textAnchor="middle" className="map-destination pirate">西 / 海盗湾</text>
        <text x="634" y="64" textAnchor="middle" className="map-destination sailor">东 / 蓝水港</text>
        {rows.map((y) => <line key={`row-${y}`} x1={px(-distance)} y1={py(y)} x2={px(distance)} y2={py(y)} className="chart-route" />)}
        {columns.map((x) => <line key={`col-${x}`} x1={px(x)} y1={py(0)} x2={px(x)} y2={py(distance)} className="chart-route" />)}
        {rows.flatMap((y) => columns.map((x) => {
          const action = view.mapActions[`${x},${y}`];
          const terminal = Math.abs(x) === distance || y === distance;
          return <g key={`${x},${y}`}>
            <circle cx={px(x)} cy={py(y)} r={action ? 13 : 4} fill={action ? "#243e40" : terminal ? "#bdaa72" : "#607b79"} stroke={action ? "#bdaa72" : "none"} />
            {action && <text x={px(x)} y={py(y) + 28} textAnchor="middle" className="map-action">{mapLabels[action]}</text>}
          </g>;
        }))}
        <g className="ship-marker" style={{ transform: `translate(${px(view.ship.x)}px, ${py(view.ship.y)}px)` }}>
          <circle r="21" fill="#d8b978" stroke="#f7e6b8" strokeWidth="2" />
          <path d="M-13 7H13L7 13H-7Z M0 -16V5 M-2 -13L-12 3H-2Z M3 -10L12 3H3Z" fill="#173034" stroke="#173034" strokeWidth="1.5" />
        </g>
        <text x="360" y="431" textAnchor="middle" className="map-caption">THE UNCHARTED WATERS</text>
      </svg>
      <figcaption><span>船位 <strong>({view.ship.x}, {view.ship.y})</strong> · 每张牌移动一步</span><span>简化海图 · 标记触发后移除</span></figcaption>
    </figure>
  );
}
