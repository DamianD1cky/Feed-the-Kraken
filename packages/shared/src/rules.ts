import type { CultRitualKind, Faction, MapAction, NavigationCard, PlayerId, VoyageMode } from "./types.js";

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 11;
export const INITIAL_GUNS = 3;
export const VICTORY_DISTANCE_QUICK = 3;
export const VICTORY_DISTANCE_LONG = 4;
/** @deprecated 使用 victoryDistance(mode) */
export const VICTORY_DISTANCE = VICTORY_DISTANCE_QUICK;
export const RESHUFFLE_DECK_THRESHOLD = 4;
/** 漫长航行：首次到达 |x|≥2 或 y≥2 视为越过补给线。 */
export const SUPPLY_LINE_THRESHOLD = 2;

export function mutinyThreshold(playerCount: number) {
  if (playerCount <= 7) return 3;
  if (playerCount <= 9) return 4;
  return 5;
}

/** @deprecated 使用 mutinyThreshold */
export const VOTE_PASS_THRESHOLD = 3;

export function offDutyOffices(playerCount: number): Array<"captain" | "firstMate" | "navigator"> {
  if (playerCount <= 6) return ["navigator"];
  if (playerCount <= 8) return ["firstMate", "navigator"];
  return ["captain", "firstMate", "navigator"];
}

/** 7 人及以上默认漫长航行；5–6 人为快速航行。 */
export function defaultVoyageMode(playerCount: number): VoyageMode {
  return playerCount >= 7 ? "long" : "quick";
}

export function victoryDistance(mode: VoyageMode) {
  return mode === "long" ? VICTORY_DISTANCE_LONG : VICTORY_DISTANCE_QUICK;
}

export function getWinner(x: number, y: number, mode: VoyageMode = "quick") {
  const distance = victoryDistance(mode);
  if (x >= distance) return "sailor" as const;
  if (x <= -distance) return "pirate" as const;
  if (y >= distance) return "cult" as const;
  return undefined;
}

export function crossedSupplyLine(x: number, y: number) {
  return Math.abs(x) >= SUPPLY_LINE_THRESHOLD || y >= SUPPLY_LINE_THRESHOLD;
}

/**
 * 快速航行海图：3 船舱搜查 + 2 喂食克拉肯。
 * 胜利距离 3。
 */
export function createQuickMapActions(): Record<string, MapAction> {
  return {
    "1,0": "cabin_search",
    "-1,0": "cabin_search",
    "1,1": "cabin_search",
    "0,1": "feed_kraken",
    "0,2": "feed_kraken",
  };
}

/**
 * 漫长航行海图：4 船舱 + 2 鞭笞 + 1 割舌 + 3 喂食。
 * 胜利距离 4；补给线阈值见 SUPPLY_LINE_THRESHOLD。
 */
export function createLongMapActions(): Record<string, MapAction> {
  return {
    "1,0": "cabin_search",
    "-1,0": "cabin_search",
    "2,0": "cabin_search",
    "-2,1": "cabin_search",
    "1,1": "flogging",
    "-1,1": "flogging",
    "0,1": "tongue",
    "0,2": "feed_kraken",
    "2,1": "feed_kraken",
    "-2,0": "feed_kraken",
  };
}

export function createMapActions(mode: VoyageMode) {
  return mode === "long" ? createLongMapActions() : createQuickMapActions();
}

export function cellKey(x: number, y: number) {
  return `${x},${y}`;
}

export function mapActionPhase(action: MapAction) {
  switch (action) {
    case "cabin_search":
      return "map_cabin" as const;
    case "feed_kraken":
      return "map_feed" as const;
    case "flogging":
      return "map_flog" as const;
    case "tongue":
      return "map_tongue" as const;
  }
}

/** 按人数生成阵营列表（含 5 人局随机移除一个水手/海盗袋）。 */
export function buildFactionPool(playerCount: number, seed: string): Faction[] {
  if (playerCount === 5) {
    const bags: Faction[] = ["sailor", "sailor", "sailor", "pirate", "pirate"];
    const removed = Math.floor(hash01(`${seed}:five`) * bags.length);
    bags.splice(removed, 1);
    return shuffle([...bags, "cult"], `${seed}:five-deal`);
  }

  const table: Record<number, { sailor: number; pirate: number; cultist: number }> = {
    6: { sailor: 3, pirate: 2, cultist: 0 },
    7: { sailor: 4, pirate: 2, cultist: 0 },
    8: { sailor: 4, pirate: 3, cultist: 0 },
    9: { sailor: 5, pirate: 3, cultist: 0 },
    10: { sailor: 5, pirate: 4, cultist: 0 },
    11: { sailor: 5, pirate: 4, cultist: 1 },
  };
  const row = table[playerCount] ?? table[6]!;
  const pool: Faction[] = ["cult"];
  for (let i = 0; i < row.cultist; i += 1) pool.push("cult");
  for (let i = 0; i < row.sailor; i += 1) pool.push("sailor");
  for (let i = 0; i < row.pirate; i += 1) pool.push("pirate");
  return shuffle(pool, `${seed}:factions`);
}

export function createCultRitualDeck(seed: string): CultRitualKind[] {
  return shuffle(
    ["conversion", "conversion", "conversion", "guns_stash", "cult_cabin_search"] as CultRitualKind[],
    `${seed}:rituals`,
  );
}

/** 快速航行 19 张（已移除 1 邪教起义、1 醉酒蓝、2 武装）。 */
export function createQuickVoyageDeck(): NavigationCard[] {
  return [
    ...eastDrunk(3),
    ...eastDisarm(2),
    ...westDrunk(5),
    ...westMermaid(2),
    ...westTelescope(2),
    ...northCult(5),
  ];
}

/** 漫长航行全部 23 张。 */
export function createLongVoyageDeck(): NavigationCard[] {
  return [
    ...eastDrunk(4),
    ...eastDisarm(2),
    ...westDrunk(5),
    ...westMermaid(2),
    ...westTelescope(2),
    card("west-armed-1", "武装", "west", -1, 0, "armed"),
    card("west-armed-2", "武装", "west", -1, 0, "armed"),
    ...northCult(6),
  ];
}

export function createVoyageDeck(mode: VoyageMode) {
  return mode === "long" ? createLongVoyageDeck() : createQuickVoyageDeck();
}

export const DESTINATION_CARDS = createQuickVoyageDeck();

/** 鞭笞：从「非本阵营」的两色中随机公开一种「我不是……」。 */
export function pickFloggingReveal(faction: Faction, seed: string): Faction {
  const others: Faction[] = (["sailor", "pirate", "cult"] as Faction[]).filter((item) => item !== faction);
  return shuffle(others, seed)[0]!;
}

export function shuffle<T>(items: T[], seed: string) {
  const result = [...items];
  const random = createSeededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createSeededRandom(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hash01(seed: string) {
  return createSeededRandom(seed)();
}

function eastDrunk(count: number) {
  return Array.from({ length: count }, (_, i) => card(`east-drunk-${i + 1}`, "醉酒", "east", 1, 0, "drunk"));
}
function eastDisarm(count: number) {
  return Array.from({ length: count }, (_, i) => card(`east-disarm-${i + 1}`, "缴械", "east", 1, 0, "disarm"));
}
function westDrunk(count: number) {
  return Array.from({ length: count }, (_, i) => card(`west-drunk-${i + 1}`, "醉酒", "west", -1, 0, "drunk"));
}
function westMermaid(count: number) {
  return Array.from({ length: count }, (_, i) => card(`west-mermaid-${i + 1}`, "美人鱼", "west", -1, 0, "mermaid"));
}
function westTelescope(count: number) {
  return Array.from({ length: count }, (_, i) => card(`west-telescope-${i + 1}`, "望远镜", "west", -1, 0, "telescope"));
}
function northCult(count: number) {
  return Array.from({ length: count }, (_, i) =>
    card(`north-cult-${i + 1}`, "邪教起义", "north", 0, 1, "cult_uprising"),
  );
}

function card(
  id: string,
  label: string,
  direction: NavigationCard["direction"],
  dx: number,
  dy: number,
  effect: NavigationCard["effect"],
): NavigationCard {
  return { id, label, direction, dx, dy, effect };
}

export type { PlayerId };
