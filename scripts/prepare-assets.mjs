#!/usr/bin/env node
// Generates the runtime WebP art and the display-font subset under packages/client/public.
// Run from the repository root: pnpm assets
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import subsetFont from "subset-font";

const root = path.resolve(import.meta.dirname, "..");
const pictures = path.join(root, "assets/picture");
const artOut = path.join(root, "packages/client/public/art");
const fontOut = path.join(root, "packages/client/public/fonts");
const cacheDir = path.join(root, ".cache/fonts");

const FONT_URL = "https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/SC/NotoSerifSC-SemiBold.otf";
const FONT_LICENSE_URL = "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/LICENSE";

const images = [
    ["harbor_with_cthulhu_16-9.png", "harbor", 1920],
    ["harbor_with_cthulhu_16-9.png", "harbor-960", 960],
    ["harbor_with_people_16_9.png", "harbor-warm", 1280],
    ["harbor_with_people_16_9.png", "harbor-warm-800", 800],
    ["cult_cards/cult_card_back.png", "secret", 280],
    ["cult_cards/cult_card_face_infect.png", "ritual", 360],
    ["items_cards/items_capital.png", "captain", 160],
    ["items_cards/items_chief_officer.png", "mate", 160],
    ["items_cards/items_handgun.png", "gun", 160],
    ["items_cards/items_rest.png", "rest", 128],
    ["items_cards/items_detect.png", "detect", 128],
    ["items_cards/items_lash.png", "lash", 128],
    ["items_cards/items_knife.png", "knife", 128],
    ["navigation_cards/navigation_card_back.png", "card-back", 360],
    ["navigation_cards/navigation_card_face_location_east.png", "card-east", 360],
    ["navigation_cards/navigation_card_face_location_west.png", "card-west", 360],
    ["navigation_cards/navigation_card_face_location_north.png", "card-north", 360],
    ["id_cards/id_card_good.png", "id-sailor", 320],
    ["id_cards/id_card_bad.png", "id-pirate", 320],
    ["id_cards/id_card_cult.png", "id-cult", 320],
];

async function buildImages() {
    await mkdir(artOut, { recursive: true });
    for (const [source, name, width] of images) {
        const output = path.join(artOut, `${name}.webp`);
        const info = await sharp(path.join(pictures, source))
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: 82, effort: 6 })
            .toFile(output);
        console.log(`art/${name}.webp  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)} KB`);
    }
}

async function download(url, file) {
    if (existsSync(file)) return;
    console.log(`downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} -> ${response.status}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
}

async function sourceFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    return entries
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.includes(".test."))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/g;

// Only elements styled with --font-display need serif glyphs; body copy uses system fonts.
// Missing glyphs fall back per character to the system serif, so re-run after changing headings.
const DISPLAY_TAGS = /<(h1|h2|h3|dt|strong|summary)[^>]*>([\s\S]*?)<\/\1>/g;
// Display labels that live in data objects (e.g. the guide rail) rather than inline JSX.
const DISPLAY_FIELDS = /\b(?:name|title):\s*"([^"]+)"/g;

async function displayGlyphs() {
    const glyphs = new Set();
    const add = (text) => {
        for (const char of text.match(CJK) ?? []) glyphs.add(char);
    };
    for (const file of await sourceFiles(path.join(root, "packages/client/src"))) {
        const text = await readFile(file, "utf8");
        if (path.basename(file) === "labels.ts") add(text);
        else {
            for (const match of text.matchAll(DISPLAY_TAGS)) add(match[2]);
            for (const match of text.matchAll(DISPLAY_FIELDS)) add(match[1]);
        }
    }
    const projectView = await readFile(path.join(root, "packages/server/src/visibility/projectView.ts"), "utf8");
    for (const match of projectView.matchAll(/title:\s*[`"]([^`"]+)[`"]/g)) add(match[1]);
    return glyphs;
}

async function buildFont() {
    await mkdir(cacheDir, { recursive: true });
    await mkdir(fontOut, { recursive: true });
    const source = path.join(cacheDir, "NotoSerifSC-SemiBold.otf");
    const license = path.join(cacheDir, "OFL.txt");
    await download(FONT_URL, source);
    await download(FONT_LICENSE_URL, license);

    const ascii = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join("");
    const glyphs = await displayGlyphs();
    const woff2 = await subsetFont(await readFile(source), ascii + [...glyphs].join(""), {
        targetFormat: "woff2",
        noLayoutClosure: true,
    });
    await writeFile(path.join(fontOut, "noto-serif-sc-display.woff2"), woff2);
    await copyFile(license, path.join(fontOut, "OFL.txt"));
    console.log(`fonts/noto-serif-sc-display.woff2  ${glyphs.size} CJK glyphs  ${(woff2.length / 1024).toFixed(1)} KB`);
}

const only = process.argv[2];
if (!only || only === "images") await buildImages();
if (!only || only === "fonts") await buildFont();
