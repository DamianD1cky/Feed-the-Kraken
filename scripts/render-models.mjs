#!/usr/bin/env node
// Renders GLB models to transparent WebP sprites for the sea chart, using headless Chrome + three.js.
// Run from the repository root: pnpm render-models [name...]
// Set CHROME_PATH if Chrome/Edge is not in a standard location.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const artOut = path.join(root, "packages/client/public/art");
const renderCache = path.join(root, ".cache/renders");

const jobs = [
    { name: "tentacle-feed", model: "kraken_tentacle_three", width: 200, yaw: 20, pitch: 12 },
    { name: "tentacle-goal", model: "kraken_tentacle_five", width: 240, yaw: 0, pitch: 12 },
    { name: "ship", model: "item_ship_fanon", width: 220, yaw: -35, pitch: 14 },
    { name: "magnifier", model: "item_detect", width: 180, yaw: 25, pitch: 25 },
];

const types = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary", ".json": "application/json" };

function serve() {
    const server = http.createServer(async (request, response) => {
        const file = path.join(root, decodeURIComponent(new URL(request.url, "http://local").pathname));
        if (!file.startsWith(root) || !existsSync(file)) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
        response.end(await readFile(file));
    });
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function chromePath() {
    const candidates = [
        process.env.CHROME_PATH,
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
    ];
    const found = candidates.find((candidate) => candidate && existsSync(candidate));
    if (!found) throw new Error("Chrome not found; set CHROME_PATH");
    return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openPage(port) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
            const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
            const socket = new WebSocket(target.webSocketDebuggerUrl);
            await new Promise((resolve) => socket.addEventListener("open", resolve));
            let id = 0;
            const pending = new Map();
            socket.addEventListener("message", (event) => {
                const message = JSON.parse(event.data);
                pending.get(message.id)?.(message.result);
                pending.delete(message.id);
            });
            const send = (method, params = {}) =>
                new Promise((resolve) => {
                    pending.set(++id, resolve);
                    socket.send(JSON.stringify({ id, method, params }));
                });
            return { send, close: () => socket.close() };
        } catch {
            await sleep(200);
        }
    }
    throw new Error("Chrome DevTools not reachable");
}

const only = new Set(process.argv.slice(2));
const selected = jobs.filter((job) => only.size === 0 || only.has(job.name));
const server = await serve();
const debugPort = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(chromePath(), [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.join(root, ".cache/render-profile")}`,
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "about:blank",
]);

try {
    await mkdir(artOut, { recursive: true });
    await mkdir(renderCache, { recursive: true });
    const page = await openPage(debugPort);
    await page.send("Runtime.enable");
    for (const job of selected) {
        const query = new URLSearchParams({
            model: `/assets/models/${job.model}/pbr/mesh_textured_pbr.glb`,
            yaw: String(job.yaw),
            pitch: String(job.pitch),
            size: "768",
        });
        await page.send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/scripts/model-render.html?${query}` });
        let result;
        const started = Date.now();
        while (!result && Date.now() - started < 180000) {
            await sleep(500);
            const { result: value } = await page.send("Runtime.evaluate", {
                expression: "window.__error ? 'ERROR:' + window.__error : window.__result ?? ''",
                returnByValue: true,
            });
            if (value?.value?.startsWith("ERROR:")) throw new Error(`${job.name}: ${value.value}`);
            result = value?.value || undefined;
        }
        if (!result) throw new Error(`${job.name}: render timed out`);
        const png = Buffer.from(result.split(",")[1], "base64");
        await writeFile(path.join(renderCache, `${job.name}.png`), png);
        const info = await sharp(png)
            .trim()
            .resize({ width: job.width, height: job.width, fit: "inside" })
            .webp({ quality: 86, alphaQuality: 90, effort: 6 })
            .toFile(path.join(artOut, `model-${job.name}.webp`));
        console.log(`art/model-${job.name}.webp  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)} KB`);
    }
    page.close();
} finally {
    chrome.kill();
    server.close();
}
