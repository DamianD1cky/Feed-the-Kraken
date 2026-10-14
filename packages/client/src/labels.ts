import type { CultRitualKind, Direction, Faction, MapAction, NavigationEffect, Phase, PlayerView } from "@feed/shared";

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
export const effectHints: Record<NavigationEffect, string> = {
  drunk: "船长职务按简历轮换", disarm: "领航员失去 1 把枪", armed: "领航员获得 1 把枪",
  mermaid: "指定一人查看本轮弃牌", telescope: "指定一人查看牌堆顶", cult_uprising: "翻开一张邪教仪式",
};
export const mapLabels: Record<MapAction, string> = {
  cabin_search: "搜查", feed_kraken: "献祭", flogging: "鞭笞", tongue: "割舌",
};
export const ritualLabels: Record<CultRitualKind, string> = {
  conversion: "皈依", guns_stash: "邪教武器库", cult_cabin_search: "邪教船舱搜查",
};
export function factionLabel(value?: string) {
  return ({ sailor: "水手", pirate: "海盗", cult: "邪教" } as Record<string, string>)[value ?? ""] ?? "未知";
}
export function roleLabel(value?: string) {
  return ({ sailor: "水手", pirate: "海盗", cult_leader: "邪教领袖", cultist: "邪教徒" } as Record<string, string>)[value ?? ""] ?? "尚未分配";
}
export const art = {
  harbor: "/art/harbor.webp", warmHarbor: "/art/harbor-warm.webp", secret: "/art/secret.webp",
  captain: "/art/captain.webp", mate: "/art/mate.webp", compass: "/art/compass.webp", gun: "/art/gun.webp",
  ship: "/art/ship.webp", navBack: "/art/nav-back.webp",
  detect: "/art/detect.webp", lash: "/art/lash.webp", knife: "/art/knife.webp", rest: "/art/rest.webp",
};
export const navFaceArt: Record<Direction, string> = {
  east: "/art/nav-east.webp", west: "/art/nav-west.webp", north: "/art/nav-north.webp",
};
export const factionArt: Record<Faction, string> = {
  sailor: "/art/id-sailor.webp", pirate: "/art/id-pirate.webp", cult: "/art/id-cult.webp",
};
export const officeArt = { captain: art.captain, firstMate: art.mate, navigator: art.compass };
export const mapActionArt: Record<MapAction, string> = {
  cabin_search: art.detect, flogging: art.lash, tongue: art.knife, feed_kraken: factionArt.cult,
};
export const ritualArt: Record<CultRitualKind, string> = {
  conversion: "/art/ritual.webp", guns_stash: "/art/ritual-guns.webp", cult_cabin_search: "/art/ritual-detect.webp",
};

/** Who the table is waiting on, from public facts only; secret actors stay unnamed. */
export function waitingOn(view: PlayerView): { ids: string[]; text: string } {
  const { offices, players } = view;
  const name = (id?: string) => players.find((p) => p.id === id)?.nickname ?? "";
  const one = (id: string | undefined, role: string, verb: string) =>
    id ? { ids: [id], text: `${role} ${name(id)} ${verb}` } : { ids: [], text: "" };
  switch (view.phase) {
    case "lobby": {
      const host = players.find((p) => p.isHost);
      return { ids: host ? [host.id] : [], text: players.length < 5 ? `还需 ${5 - players.length} 位船员登船` : `等待房主 ${host?.nickname ?? ""} 扬帆` };
    }
    case "officers": return one(offices.captainId, "船长", "正在任命大副与领航员");
    case "mutiny": {
      const pending = players.filter((p) => !p.dead && !p.isCaptain && !p.hasVoted).map((p) => p.id);
      return { ids: pending, text: pending.length ? `${pending.length} 名船员尚未决定是否亮枪` : "正在清点枪数" };
    }
    case "mutiny_tiebreak": return { ids: view.mutinyTieCandidates ?? [], text: "叛变平手，正在逐一剔除" };
    case "captain_nav": return one(offices.captainId, "船长", "正在选牌");
    case "mate_nav": return one(offices.firstMateId, "大副", "正在选牌");
    case "navigator_nav": return one(offices.navigatorId, "领航员", "正在决定航线");
    case "map_cabin": case "map_feed": case "map_flog": case "map_tongue":
    case "effect_mermaid": case "effect_telescope": case "emergency_navigator":
      return one(offices.captainId, "船长", "正在执行");
    case "effect_telescope_decide": return { ids: [], text: "有人正在眺望牌堆顶" };
    case "ritual_pending": case "ritual_convert": case "ritual_guns": case "ritual_cabin":
      return { ids: [], text: "邪教仪式进行中，请闭眼" };
    case "ended": return { ids: [], text: "所有阵营已经揭晓" };
  }
}
