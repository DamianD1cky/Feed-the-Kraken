import { useSyncExternalStore } from "react";
import { create } from "zustand";
import type { PlayerView, ServerMessage } from "@feed/shared";
import type { Room } from "@colyseus/sdk";
import { director } from "./director/director";

type Session = Extract<ServerMessage, { type: "session.established" }>;

type AppState = {
  room?: Room;
  session?: Session;
  /** The latest view from the server; the table renders the director's stage, which trails it. */
  view?: PlayerView;
  error?: string;
  connected: boolean;
  setConnected(connected: boolean): void;
  setRoom(room: Room | undefined): void;
  setSession(session: Session): void;
  setView(view: PlayerView): void;
  setError(error: string | undefined): void;
  reset(): void;
};

export const useAppStore = create<AppState>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
  setRoom: (room) => set({ room }),
  setSession: (session) => set({ session }),
  setView: (view) => {
    director.receive(view);
    set({ view });
  },
  setError: (error) => set({ error }),
  reset: () => {
    director.cut(undefined);
    set({ room: undefined, session: undefined, view: undefined, error: undefined, connected: false });
  },
}));

export const useStage = () => useSyncExternalStore(director.subscribe, director.snapshot);
