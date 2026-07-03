import { z } from "zod";
import { PROTOCOL_VERSION } from "./types.js";

export const clientActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("startGame") }),
  z.object({
    type: z.literal("assignOfficers"),
    firstMateId: z.string().min(1),
    navigatorId: z.string().min(1),
  }),
  z.object({
    type: z.literal("commitVote"),
    guns: z.number().int().min(0).max(2),
  }),
  z.object({
    type: z.literal("chooseDestination"),
    cardId: z.string().min(1),
  }),
]);

export const clientActionEnvelopeSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  actionId: z.string().min(1),
  roomId: z.string().min(1),
  playerId: z.string().min(1),
  action: clientActionSchema,
  sentAt: z.number().int().positive(),
});
