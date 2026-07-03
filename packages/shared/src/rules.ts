import type { DestinationCard } from "./types.js";

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 11;
export const INITIAL_GUNS = 2;
export const VOTE_PASS_THRESHOLD = 3;
export const VICTORY_DISTANCE = 3;

export const DESTINATION_CARDS: DestinationCard[] = [
  { id: "east-1", label: "东风航线", direction: "east", dx: 1, dy: 0 },
  { id: "east-2", label: "蓝潮航线", direction: "east", dx: 1, dy: 0 },
  { id: "west-1", label: "西雾航线", direction: "west", dx: -1, dy: 0 },
  { id: "west-2", label: "赤浪航线", direction: "west", dx: -1, dy: 0 },
  { id: "north-1", label: "北海航线", direction: "north", dx: 0, dy: 1 },
  { id: "north-2", label: "深渊航线", direction: "north", dx: 0, dy: 1 },
];

export function getWinner(x: number, y: number) {
  if (x >= VICTORY_DISTANCE) return "sailor" as const;
  if (x <= -VICTORY_DISTANCE) return "pirate" as const;
  if (y >= VICTORY_DISTANCE) return "cult" as const;
  return undefined;
}
