import { create } from "zustand";

export type PickMode = "none" | "officers" | "single";

type SelectionState = {
    promptKey: string;
    mode: PickMode;
    candidates: string[];
    firstMateId?: string;
    navigatorId?: string;
    targetId?: string;
    /** The navigation card picked up from the table, before it is kept or played. */
    cardId?: string;
    /** Set once the action is sent, so a second click cannot send it again before the reply. */
    sent: boolean;
    begin(promptKey: string, mode: PickMode, candidates: string[]): void;
    pick(playerId: string): void;
    chooseCard(cardId: string): void;
    markSent(): void;
    /** The server refused the action: let the player try again. */
    unsend(): void;
};

export const useSelection = create<SelectionState>((set, get) => ({
    promptKey: "",
    mode: "none",
    candidates: [],
    sent: false,
    begin: (promptKey, mode, candidates) => {
        if (get().promptKey === promptKey) return;
        set({ promptKey, mode, candidates, firstMateId: undefined, navigatorId: undefined, targetId: undefined, cardId: undefined, sent: false });
    },
    pick: (playerId) => {
        const { mode, candidates, firstMateId, navigatorId, targetId, sent } = get();
        if (sent || !candidates.includes(playerId)) return;
        if (mode === "single") set({ targetId: targetId === playerId ? undefined : playerId });
        if (mode !== "officers") return;
        if (playerId === firstMateId) set({ firstMateId: undefined });
        else if (playerId === navigatorId) set({ navigatorId: undefined });
        else if (!firstMateId) set({ firstMateId: playerId });
        else set({ navigatorId: playerId });
    },
    chooseCard: (cardId) => {
        if (get().sent) return;
        set({ cardId: get().cardId === cardId ? undefined : cardId });
    },
    markSent: () => set({ sent: true }),
    unsend: () => set({ sent: false }),
}));

/** What the viewer chose locally, so a choreography can start from the card they let go. */
export const intent: { keptCardId?: string } = {};

type DeskState = {
    /** Your identity card, turned up toward you. It closes whenever the page is hidden. */
    dossierOpen: boolean;
    hoverCardId?: string;
    setDossierOpen(open: boolean): void;
    hoverCard(cardId: string | undefined): void;
};

/** What your hands are doing at your place, independent of any prompt. */
export const useDesk = create<DeskState>((set) => ({
    dossierOpen: false,
    setDossierOpen: (dossierOpen) => set({ dossierOpen }),
    hoverCard: (hoverCardId) => set({ hoverCardId }),
}));
