import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export type ModelName =
    | "ship-sails"
    | "ship-furled"
    | "candle"
    | "tentacle"
    | "tentacle-small"
    | "helm"
    | "mate-badge"
    | "magnifier"
    | "pistol"
    | "knife"
    | "off-duty";

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<ModelName, Promise<THREE.Group>>();

/** Each model is fetched once per page; every table and every copy shares its geometry and textures. */
function load(name: ModelName) {
    let model = cache.get(name);
    if (!model) {
        model = loader.loadAsync(`/models/${name}.glb`).then((gltf) => gltf.scene);
        cache.set(name, model);
    }
    return model;
}

export type PropOptions = {
    size: number;
    rotation?: [number, number, number];
    shadow?: boolean;
    /** Own copies of the materials, so this one can fade without fading every other copy. */
    ownMaterials?: boolean;
};

/**
 * A copy of a model whose largest side is `size`, standing on y = 0 and centred on its footprint,
 * so placing it is just setting the holder's position.
 */
export async function prop(name: ModelName, { size, rotation = [0, 0, 0], shadow = true, ownMaterials = false }: PropOptions) {
    const source = await load(name);
    const model = source.clone(true);
    model.rotation.set(...rotation);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    model.scale.setScalar(size / Math.max(...box.getSize(new THREE.Vector3()).toArray()));
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    const centre = box.getCenter(new THREE.Vector3());
    model.position.set(-centre.x, -box.min.y, -centre.z);
    model.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.castShadow = shadow;
        o.receiveShadow = true;
        if (ownMaterials) o.material = (o.material as THREE.Material).clone();
    });
    const holder = new THREE.Group();
    holder.add(model);
    holder.userData.footprint = box.getSize(new THREE.Vector3());
    return holder;
}

/** Fades every material under `root`; the materials must be its own (see `ownMaterials`). */
export function setOpacity(root: THREE.Object3D, opacity: number) {
    root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            m.transparent = opacity < 1;
            m.opacity = opacity;
            m.depthWrite = opacity >= 1;
        }
    });
}
