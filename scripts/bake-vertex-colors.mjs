// Usage: node scripts/bake-vertex-colors.mjs <in.glb> <out.glb> <ratio> <error>
//
// Scanned models with shattered UVs cannot be simplified: nearly every edge is a texture seam, and the
// simplifier will not collapse a seam. This bakes the base colour texture into vertex colours, drops the
// UVs, merges the vertices that only existed to carry different UVs, and only then simplifies.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt, prune, simplify } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { PNG } from "pngjs";

const [input, output, ratio = "0.025", error = "0.01"] = process.argv.slice(2);
if (!input || !output) {
    console.error("usage: node scripts/bake-vertex-colors.mjs <in.glb> <out.glb> [ratio] [error]");
    process.exit(1);
}

await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(input);
const buffer = doc.getRoot().listBuffers()[0];

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
        const material = prim.getMaterial();
        const texture = material?.getBaseColorTexture();
        const uvs = prim.getAttribute("TEXCOORD_0");
        if (!texture || !uvs) continue;

        const image = PNG.sync.read(Buffer.from(texture.getImage()));
        const sample = (u, v, out) => {
            const x = Math.min(Math.max(u * image.width - 0.5, 0), image.width - 1);
            const y = Math.min(Math.max(v * image.height - 0.5, 0), image.height - 1);
            const x0 = Math.floor(x);
            const y0 = Math.floor(y);
            const x1 = Math.min(x0 + 1, image.width - 1);
            const y1 = Math.min(y0 + 1, image.height - 1);
            const fx = x - x0;
            const fy = y - y0;
            for (let c = 0; c < 3; c++) {
                const at = (px, py) => image.data[(py * image.width + px) * 4 + c] / 255;
                const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
                const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
                out[c] = toLinear(top * (1 - fy) + bottom * fy);
            }
        };

        const positions = prim.getAttribute("POSITION").getArray();
        const normals = prim.getAttribute("NORMAL")?.getArray();
        const uv = uvs.getArray();
        const indices = prim.getIndices().getArray();
        const count = positions.length / 3;

        // One vertex per position: colours and normals of the seam duplicates are averaged.
        const slotOf = new Map();
        const remap = new Uint32Array(count);
        const sums = [];
        const rgb = [0, 0, 0];
        for (let i = 0; i < count; i++) {
            const key = `${positions[i * 3]},${positions[i * 3 + 1]},${positions[i * 3 + 2]}`;
            let slot = slotOf.get(key);
            if (slot === undefined) {
                slot = sums.length;
                slotOf.set(key, slot);
                sums.push({ first: i, n: 0, color: [0, 0, 0], normal: [0, 0, 0] });
            }
            remap[i] = slot;
            const s = sums[slot];
            sample(uv[i * 2], uv[i * 2 + 1], rgb);
            for (let c = 0; c < 3; c++) {
                s.color[c] += rgb[c];
                if (normals) s.normal[c] += normals[i * 3 + c];
            }
            s.n++;
        }

        const welded = sums.length;
        const nextPositions = new Float32Array(welded * 3);
        const nextNormals = new Float32Array(welded * 3);
        const nextColors = new Float32Array(welded * 3);
        sums.forEach((s, slot) => {
            const length = Math.hypot(...s.normal) || 1;
            for (let c = 0; c < 3; c++) {
                nextPositions[slot * 3 + c] = positions[s.first * 3 + c];
                nextNormals[slot * 3 + c] = s.normal[c] / length;
                nextColors[slot * 3 + c] = s.color[c] / s.n;
            }
        });
        const nextIndices = [];
        for (let t = 0; t < indices.length; t += 3) {
            const a = remap[indices[t]];
            const b = remap[indices[t + 1]];
            const c = remap[indices[t + 2]];
            if (a !== b && b !== c && a !== c) nextIndices.push(a, b, c);
        }

        const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
        prim.setAttribute("POSITION", accessor("VEC3", nextPositions));
        prim.setAttribute("NORMAL", accessor("VEC3", nextNormals));
        prim.setAttribute("COLOR_0", accessor("VEC3", nextColors));
        prim.setAttribute("TEXCOORD_0", null);
        prim.setIndices(accessor("SCALAR", new Uint32Array(nextIndices)));

        material.setBaseColorTexture(null).setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(0.8);
        console.log(`${count} → ${welded} vertices after merging seams, ${indices.length / 3} → ${nextIndices.length / 3} triangles`);
    }
}

await doc.transform(
    prune(),
    simplify({ simplifier: MeshoptSimplifier, ratio: Number(ratio), error: Number(error) }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
const triangles = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0);
await io.write(output, doc);
console.log(`${output}: ${triangles} triangles`);
