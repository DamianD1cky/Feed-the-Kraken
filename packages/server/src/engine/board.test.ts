import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
    boardCellKind,
    boardCells,
    createMapActions,
    getWinner,
    nextShipCell,
    type BoardCell,
    type Direction,
    type VoyageMode,
} from "@feed/shared";

const modes: VoyageMode[] = ["quick", "long"];
const directions: Direction[] = ["east", "west", "north"];

function sail(mode: VoyageMode, direction: Direction) {
    let cell: BoardCell = { x: 0, y: 0 };
    for (let steps = 1; steps <= 20; steps += 1) {
        cell = nextShipCell(mode, cell, direction);
        const winner = getWinner(cell.x, cell.y, mode);
        if (winner) return { winner, steps };
    }
    throw new Error(`${mode} ${direction} never reached a goal`);
}

test("quick board has 28 cells and the start is the southern centre", () => {
    assert.equal(boardCells("quick").length, 28);
    assert.equal(boardCellKind("quick", 0, 0), "water");
    assert.equal(boardCellKind("quick", 0, -1), undefined);
});

test("map actions sit on water cells", () => {
    for (const mode of modes) {
        for (const key of Object.keys(createMapActions(mode))) {
            const [x, y] = key.split(",").map(Number);
            assert.equal(boardCellKind(mode, x!, y!), "water", `${mode} ${key}`);
        }
    }
});

test("quick map places two feeds beside the goals and three searches", () => {
    const actions = createMapActions("quick");
    assert.deepEqual(
        Object.entries(actions).filter(([, action]) => action === "feed_kraken").map(([key]) => key).sort(),
        ["-1,3", "1,3"],
    );
    assert.equal(Object.values(actions).filter((action) => action === "cabin_search").length, 3);
});

test("a single colour sails to its own goal", () => {
    for (const mode of modes) {
        assert.equal(sail(mode, "east").winner, "sailor");
        assert.equal(sail(mode, "west").winner, "pirate");
        assert.equal(sail(mode, "north").winner, "cult");
    }
    assert.equal(sail("quick", "east").steps, 5);
    assert.equal(sail("quick", "north").steps, 5);
});

test("every water cell moves to another cell for every colour", () => {
    for (const mode of modes) {
        for (const cell of boardCells(mode).filter((item) => item.kind === "water")) {
            for (const direction of directions) {
                const next = nextShipCell(mode, cell, direction);
                assert.notDeepEqual(next, { x: cell.x, y: cell.y }, `${mode} ${cell.x},${cell.y} ${direction}`);
                assert.ok(boardCellKind(mode, next.x, next.y), `${mode} ${cell.x},${cell.y} ${direction} left the board`);
            }
        }
    }
});

test("yellow never delivers the ship to the pirate or sailor goal", () => {
    for (const mode of modes) {
        for (const cell of boardCells(mode).filter((item) => item.kind === "water")) {
            const next = nextShipCell(mode, cell, "north");
            const kind = boardCellKind(mode, next.x, next.y);
            assert.ok(kind === "water" || kind === "cult", `${mode} ${cell.x},${cell.y} -> ${kind}`);
        }
    }
});
