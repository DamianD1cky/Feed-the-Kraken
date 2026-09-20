import { create } from "zustand";
import type { PlayerView, ServerMessage } from "@feed/shared";
import type { Room } from "@colyseus/sdk";

type Session = Extract<ServerMessage, { type: "session.established" }>;

type AppState = {
  room?: Room;
  session?: Session;
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
  setView: (view) => set({ view }),
  setError: (error) => set({ error }),
  reset: () => set({ room: undefined, session: undefined, view: undefined, error: undefined, connected: false }),
}));
