/**
 * HTML pinned to things on the table: name slips beside seals, invisible buttons over your cards.
 * Components register elements here; the table moves them every frame it draws.
 */
const tracked = new Map<string, HTMLElement>();

/** `ref={trackRef("slip:" + id)}`; React 19 calls the returned cleanup on detach. */
export function trackRef(id: string) {
    return (el: HTMLElement | null) => {
        if (!el) return;
        tracked.set(id, el);
        return () => {
            if (tracked.get(id) === el) tracked.delete(id);
        };
    };
}

export const trackedElement = (id: string) => tracked.get(id);
