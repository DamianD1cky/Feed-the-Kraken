import { z } from "zod";
import { PROTOCOL_VERSION } from "./types.js";

export const clientActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("startGame"), voyageMode: z.enum(["quick", "long"]).optional() }),
  z.object({
    type: z.literal("assignOfficers"),
    firstMateId: z.string().min(1),
    navigatorId: z.string().min(1),
  }),
  z.object({
    type: z.literal("commitMutiny"),
    guns: z.number().int().min(0).max(40),
  }),
  z.object({
    type: z.literal("eliminateTieCandidate"),
    playerId: z.string().min(1),
  }),
  z.object({
    type: z.literal("keepNavigationCard"),
    cardId: z.string().min(1),
  }),
  z.object({ type: z.literal("jumpShip") }),
  z.object({
    type: z.literal("pickPlayer"),
    playerId: z.string().min(1),
  }),
  z.object({
    type: z.literal("telescopeDecision"),
    discard: z.boolean(),
  }),
  z.object({
    type: z.literal("distributeCultGuns"),
    grants: z
      .array(z.object({ playerId: z.string().min(1), guns: z.number().int().min(0).max(3) }))
      .max(3),
  }),
  z.object({ type: z.literal("acknowledge") }),
]);

export const clientActionEnvelopeSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  actionId: z.string().min(1),
  roomId: z.string().min(1),
  playerId: z.string().min(1),
  action: clientActionSchema,
  sentAt: z.number().int().positive(),
});
