import type { Direction, Faction, MapAction, NavigationEffect, Phase } from "@feed/shared";

export const phaseLabels: Record<Phase, string> = {
  lobby: "港口集结", officers: "任命船员", mutiny: "忠诚的拷问", mutiny_tiebreak: "叛变裁决",
  captain_nav: "船长选牌", mate_nav: "大副选牌", navigator_nav: "领航抉择",
  map_cabin: "船舱搜查", map_feed: "喂食克拉肯", map_flog: "鞭笞", map_tongue: "割舌",
  effect_mermaid: "美人鱼", effect_telescope: "望远镜", effect_telescope_decide: "眺望航线",
  ritual_pending: "邪教仪式", ritual_convert: "秘密皈依", ritual_guns: "邪教武器库",
  ritual_cabin: "邪教搜查", emergency_navigator: "紧急领航", ended: "航行结束",
};
export const directionLabels: Record<Direction, string> = { east: "东 · 水手", west: "西 · 海盗", north: "北 · 克拉肯" };
export const effectLabels: Record<NavigationEffect, string> = {
  drunk: "醉酒", disarm: "缴械", mermaid: "美人鱼", telescope: "望远镜", cult_uprising: "邪教起义", armed: "武装",
};
export const mapLabels: Record<MapAction, string> = {
  cabin_search: "搜查", feed_kraken: "献祭", flogging: "鞭笞", tongue: "割舌",
};
export function factionLabel(value?: string) {
  return ({ sailor: "水手", pirate: "海盗", cult: "邪教" } as Record<string, string>)[value ?? ""] ?? "未知";
}
export function roleLabel(value?: string) {
  return ({ sailor: "水手", pirate: "海盗", cult_leader: "邪教领袖", cultist: "邪教徒" } as Record<string, string>)[value ?? ""] ?? "尚未分配";
}
export const art = {
  harbor: "/art/harbor.webp",
  harborSrcSet: "/art/harbor-960.webp 960w, /art/harbor.webp 1672w",
  warmHarbor: "/art/harbor-warm.webp",
  warmHarborSrcSet: "/art/harbor-warm-800.webp 800w, /art/harbor-warm.webp 1280w",
  secret: "/art/secret.webp",
  captain: "/art/captain.webp",
  mate: "/art/mate.webp",
  gun: "/art/gun.webp",
  rest: "/art/rest.webp",
  detect: "/art/detect.webp",
  lash: "/art/lash.webp",
  knife: "/art/knife.webp",
  ritual: "/art/ritual.webp",
  cardBack: "/art/card-back.webp",
};
export const cardArt: Record<Direction, string> = {
  east: "/art/card-east.webp", west: "/art/card-west.webp", north: "/art/card-north.webp",
};
export const identityArt: Record<Faction, string> = {
  sailor: "/art/id-sailor.webp", pirate: "/art/id-pirate.webp", cult: "/art/id-cult.webp",
};
