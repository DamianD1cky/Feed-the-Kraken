import config, { listen } from "@colyseus/tools";
import { matchMaker, type Server as ColyseusServer } from "colyseus";
import type { Application, Request, Response } from "express";
import { PROTOCOL_VERSION } from "@feed/shared";
import { getEventStore } from "./db/eventStore.js";
import { gameDebugEnabled, gameDebugLog } from "./debug.js";
import { KrakenRoom } from "./rooms/KrakenRoom.js";

const port = Number(process.env.PORT ?? 2567);

const eventStore = getEventStore();
await listen(config({
  initializeExpress(app: Application) {
    app.get("/api/health", (_req: Request, res: Response) => {
      res.json({
        ok: true,
        service: "feed-the-kraken-server",
        protocolVersion: PROTOCOL_VERSION,
        debugMode: gameDebugEnabled,
        uptimeSec: Math.round(process.uptime()),
      });
    });
  },
  initializeGameServer(gameServer: ColyseusServer) {
    gameServer.define("kraken", KrakenRoom);
  },
  async beforeListen() {
    const roomIds = eventStore.listRecoverableRoomIds?.() ?? [];
    for (const restoreRoomId of roomIds) {
      await matchMaker.createRoom("kraken", { restoreRoomId });
    }
    if (roomIds.length > 0) {
      console.log(`Restored ${roomIds.length} Feed the Kraken room(s).`);
    }
  },
}), port);

console.log(`Feed the Kraken MVP server listening on :${port}`);
gameDebugLog("server", "debug mode enabled", { env: "FTK_DEBUG" });
