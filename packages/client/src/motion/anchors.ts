/** Imperative handles that components publish for choreographies (the table's pieces and camera). */
const rigs = new Map<string, unknown>();

export function publishRig<T>(id: string, rig: T) {
    rigs.set(id, rig);
    return () => {
        if (rigs.get(id) === rig) rigs.delete(id);
    };
}

export const rig = <T>(id: string) => rigs.get(id) as T | undefined;
