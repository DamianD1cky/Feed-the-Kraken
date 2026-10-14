import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
    victoryDistance,
    type CultRitualKind,
    type MapAction,
    type NavigationCard,
    type Phase,
    type PlayerView,
} from "@feed/shared";
import { waitingOn } from "../labels";
import { motionEnabled, onFrame } from "../motion/clock";
import { spring } from "../motion/curves";
import {
    BEZEL_TOP,
    CHART,
    CHART_Y,
    DISC_R,
    REVEAL_YAW,
    SEAT_R,
    SPOTS,
    chartOf,
    headingYaw,
    onRing,
    seatAngle,
    sideOf,
    slotOf,
    type Chart,
    type Slot,
} from "./layout";
import { prop, setOpacity, type ModelName } from "./models";
import { trackedElement } from "./overlay";
import {
    cardBack,
    coinFace,
    identityFace,
    loadArt,
    markerTexture,
    navCardFace,
    paintChart,
    paintLogbook,
    paintPlaque,
    ritualFace,
    secretBack,
    setAnisotropy,
    type Art,
} from "./paint";
import {
    Kit,
    buildBezel,
    buildBook,
    buildChart,
    buildPlaque,
    buildTable,
    cardMesh,
    compassCoin,
    contactShadow,
    glowPlane,
    markerToken,
    restampSeal,
    rippleRing,
    setCardFace,
    waxSeal,
    type Card,
    type Seal,
} from "./pieces";

export type Office = "captain" | "firstMate" | "navigator";

/** What the viewer is doing with their hands that the table should show: a chosen card, an open dossier. */
export type TableUi = {
    chosenCardId?: string;
    hoverCardId?: string;
    dossierOpen: boolean;
    /** Officers the captain has picked but not yet confirmed; their tokens wait translucent at the seat. */
    pending: { firstMate?: string; navigator?: string };
};

type SeatPiece = {
    id: string;
    seal: Seal;
    angle: number;
    target: number;
    enter: number;
    pulse: number;
};
type Placed = {
    obj: THREE.Object3D;
    target: THREE.Vector3;
    yaw: number;
    held: boolean;
    enter: number;
};
type HandPiece = { card: Card; base: THREE.Vector3; yaw: number; lift: number };

const OFFICE_MODEL: Record<
    Exclude<Office, "navigator">,
    { name: ModelName; size: number; rotation: [number, number, number] }
> = {
    captain: { name: "helm", size: 0.62, rotation: [-Math.PI / 2, 0, 0.3] },
    firstMate: {
        name: "mate-badge",
        size: 0.52,
        rotation: [-Math.PI / 2, 0, -0.2],
    },
};
const HOLDER_PHASE: Partial<
    Record<Phase, "captainId" | "firstMateId" | "navigatorId">
> = {
    captain_nav: "captainId",
    mate_nav: "firstMateId",
    navigator_nav: "navigatorId",
};
const ease = (dt: number, rate: number) =>
    motionEnabled() ? 1 - Math.exp(-rate * dt) : 1;
/** How long something new takes to drop onto the table and settle. */
const ENTER_S = 0.9;

export class TableScene {
    readonly canvas: HTMLCanvasElement;
    readonly kit = new Kit();
    private renderer: THREE.WebGLRenderer;
    private scene = new THREE.Scene();
    private camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 60);
    private env: THREE.Texture;
    private observer: ResizeObserver;
    private leaveFrame: () => void;
    private disposed = false;
    private width = 1;
    private height = 1;

    // camera: a resting pose per screen shape, a lean toward the pointer, a push a choreography can ask for
    private home = new THREE.Vector3(0.3, 10.6, 10.2);
    private look = new THREE.Vector3(0.3, 0, 0.75);
    private lean = new THREE.Vector2();
    private leanTarget = new THREE.Vector2();
    private pushFocus = new THREE.Vector3();
    private pushK = 0;
    private shake = new THREE.Vector2();

    // light
    private hemi = new THREE.HemisphereLight(0x6e7d96, 0x1a1009, 0.28);
    private lantern = new THREE.SpotLight(0xffd29a, 320, 48, 0.44, 0.95, 1.7);
    private candleLight = new THREE.PointLight(0xff9a48, 16, 11, 1.8);
    private throatGlow = new THREE.PointLight(0x3fd6b0, 0, 6, 1.6);
    private flame: THREE.Sprite;
    private deepLevel = 0;
    private deepPulse = 0;

    // the table and what never leaves it
    private chartPaint: ReturnType<typeof buildChart>;
    private chartKey = "";
    private plaque: ReturnType<typeof buildPlaque>;
    private plaqueKey = "";
    private plaqueBump = 0;
    private book: ReturnType<typeof buildBook>;
    private bookKey = "";
    private pointer: THREE.Group;
    private turnGlows: THREE.Mesh[] = [];
    private highlight: THREE.Mesh;
    private ripple: THREE.Mesh;
    private deck = new THREE.Group();

    // what the view puts on it
    private view?: PlayerView;
    private images?: Art;
    private seats = new Map<string, SeatPiece>();
    private offices = new Map<Office, Placed>();
    private pendingOffices = new Map<"firstMate" | "navigator", Placed>();
    private mugs = new Map<string, Placed>();
    private knives = new Map<string, Placed>();
    private loading = new Set<string>();
    private ship?: THREE.Group;
    private shipHeld = false;
    private kraken?: THREE.Group;
    private krakenScale = 1;
    private bigTentacle?: THREE.Group;
    private hand = new Map<string, HandPiece>();
    private taken = new Set<string>();
    private held: { holder?: string; cards: Card[]; dealt: boolean } = {
        cards: [],
        dealt: false,
    };
    private dossier: THREE.Group;
    private dossierCard: Card;
    private dossierFlip = 0;
    private dossierKey = "";
    private revealed?: { id: string; card: Card };
    private parked = new Map<string, THREE.Object3D[]>();
    private trail: Array<{ x: number; y: number }> = [];
    private ui: TableUi = { dossierOpen: false, pending: {} };
    private settled = false;

    // drawing on demand
    private dirty = true;
    private shadowsDirty = true;
    private active = 0;
    private lastTick = 0;
    private lastDraw = 0;
    private drawQueued = false;

    constructor(host: HTMLElement) {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance",
        });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // Only the lantern casts shadows, and only moving things change them.
        this.renderer.shadowMap.autoUpdate = false;
        setAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
        this.canvas = this.renderer.domElement;
        this.canvas.className = "table-canvas";
        host.prepend(this.canvas);

        const scene = this.scene;
        scene.background = new THREE.Color(0x090604);
        scene.fog = new THREE.Fog(0x090604, 15, 30);
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        scene.environment = this.env;
        scene.environmentIntensity = 0.22;

        this.lantern.position.set(7.5, 14.5, 5.5);
        this.lantern.target.position.set(-0.6, 0, -0.2);
        this.lantern.castShadow = true;
        this.lantern.shadow.mapSize.set(2048, 2048);
        this.lantern.shadow.bias = -0.0003;
        this.lantern.shadow.normalBias = 0.02;
        const flamePos = new THREE.Vector3(
            SPOTS.candle.x + 0.05,
            1.36,
            SPOTS.candle.z - 0.02,
        );
        this.candleLight.position.copy(flamePos);
        this.flame = new THREE.Sprite(
            this.kit.own(
                new THREE.SpriteMaterial({
                    map: this.kit.glow,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                }),
            ),
        );
        this.flame.scale.set(0.55, 0.75, 1);
        this.flame.position.copy(flamePos);
        this.flame.visible = false;
        scene.add(
            this.hemi,
            this.lantern,
            this.lantern.target,
            this.candleLight,
            this.throatGlow,
            this.flame,
        );

        const kit = this.kit;
        this.chartPaint = buildChart(kit);
        this.plaque = buildPlaque(kit);
        this.book = buildBook(kit);
        this.book.book.position.copy(SPOTS.book);
        this.book.book.rotation.y = -0.14;
        scene.add(
            buildTable(kit),
            buildBezel(kit),
            this.chartPaint.disc,
            this.plaque.plaque,
            this.book.book,
        );

        const cone = new THREE.Mesh(
            kit.own(new THREE.ConeGeometry(0.11, 0.34, 4)),
            kit.brassPlain,
        );
        cone.rotation.z = -Math.PI / 2;
        cone.position.x = DISC_R - 0.24;
        cone.castShadow = true;
        this.pointer = new THREE.Group();
        this.pointer.add(cone);
        this.pointer.position.set(CHART.x, 0.12, CHART.z);
        this.pointer.visible = false;
        this.highlight = glowPlane(kit, 1.5);
        this.highlight.visible = false;
        this.ripple = rippleRing(kit);
        scene.add(this.pointer, this.highlight, this.ripple, this.deck);

        this.dossierCard = cardMesh(kit, undefined, undefined, {
            w: 0.78,
            d: 1.04,
        });
        this.dossier = new THREE.Group();
        this.dossier.add(this.dossierCard);
        const secretSeal = waxSeal(kit, "密", { radius: 0.2 });
        // On the card's back, so it rides along when the card turns over.
        secretSeal.rotation.z = Math.PI;
        secretSeal.position.set(0, -0.0125, 0.05);
        this.dossier.add(secretSeal);
        this.dossier.position.copy(SPOTS.dossier);
        this.dossier.rotation.set(0, 0.16, Math.PI);
        this.dossier.visible = false;
        scene.add(this.dossier);

        void loadArt().then((images) => {
            if (this.disposed) return;
            this.images = images;
            this.dossierKey = "";
            this.chartKey = "";
            this.buildDeck(images);
            this.buildCoin(images);
            if (this.view) this.apply(this.view);
            this.touch();
        });
        void this.loadScenery();

        this.observer = new ResizeObserver(() => this.resize(host));
        this.observer.observe(host);
        this.resize(host);
        host.addEventListener("pointermove", this.onPointer);
        host.addEventListener("pointerleave", this.onPointerLeave);
        this.leaveFrame = onFrame(this.tick);
    }

    // ── the view ────────────────────────────────────────────────────────────

    /** Lays the table out as `view` says, carrying what moved rather than rebuilding it. */
    setView(view: PlayerView) {
        const fresh =
            this.view?.roomId !== view.roomId ||
            this.view?.viewerId !== view.viewerId;
        if (fresh) {
            this.trail = [];
            this.settled = false;
        }
        this.view = view;
        this.apply(view);
        this.settled = true;
        this.touch();
    }

    setUi(ui: TableUi) {
        this.ui = ui;
        this.syncPending();
        this.touch();
    }

    private apply(view: PlayerView) {
        this.syncSeats(view);
        this.syncTrail(view);
        this.syncChart(view);
        this.syncShip(view);
        this.syncOffices(view);
        this.syncStatus(view);
        this.syncHand(view);
        this.syncHeld(view);
        this.syncDossier(view);
        this.syncReveal(view);
        this.syncBook(view);
        this.syncPlaque(view);
        this.syncTurn(view);
        this.syncPending();
    }

    get chart(): Chart {
        return chartOf(this.view?.voyageMode ?? "quick");
    }

    private syncSeats(view: PlayerView) {
        const count = view.players.length;
        const viewer = Math.max(
            0,
            view.players.findIndex((p) => p.id === view.viewerId),
        );
        const present = new Set<string>();
        view.players.forEach((player, index) => {
            present.add(player.id);
            const angle = seatAngle(index, count, viewer);
            let seat = this.seats.get(player.id);
            if (!seat) {
                const seal = waxSeal(this.kit, String(index + 1), {
                    dim: player.dead,
                    radius: player.id === view.viewerId ? 0.31 : 0.27,
                });
                seal.rotation.y = (this.kit.rand() - 0.5) * 0.25;
                seat = {
                    id: player.id,
                    seal,
                    angle,
                    target: angle,
                    enter: this.settled ? 0 : 1,
                    pulse: 0,
                };
                this.scene.add(seal);
                this.seats.set(player.id, seat);
            }
            // Turn the short way round when someone joins and the seats spread out.
            seat.target =
                angle +
                Math.PI * 2 * Math.round((seat.angle - angle) / (Math.PI * 2));
            if (!this.settled) seat.angle = seat.target;
            restampSeal(this.kit, seat.seal, String(index + 1), player.dead);
            this.placeSeat(seat);
        });
        for (const [id, seat] of this.seats) {
            if (present.has(id)) continue;
            this.scene.remove(seat.seal);
            this.seats.delete(id);
        }
    }

    private placeSeat(seat: SeatPiece) {
        const drop =
            seat.enter < 1
                ? (1 - spring(seat.enter * ENTER_S, 0.55, 14)) * 0.9
                : 0;
        seat.seal.position.copy(onRing(seat.angle, SEAT_R, BEZEL_TOP + drop));
        const pop = 1 + Math.sin(Math.min(1, seat.pulse) * Math.PI) * 0.18;
        seat.seal.scale.y = pop;
    }

    /** Where a seat is, for props and flights; undefined for someone not at the table. */
    seat(id?: string) {
        const seat = id ? this.seats.get(id) : undefined;
        return seat
            ? {
                  angle: seat.target,
                  position: onRing(seat.target, SEAT_R, BEZEL_TOP + 0.1),
              }
            : undefined;
    }

    slot(id: string | undefined, slot: Slot) {
        const seat = this.seat(id);
        if (!seat) return undefined;
        return slotOf(seat.angle, Math.max(this.seats.size, 1), slot);
    }

    private syncTrail(view: PlayerView) {
        const last = this.trail.at(-1);
        if (view.phase === "lobby" || !last)
            this.trail = [{ x: view.ship.x, y: view.ship.y }];
        else if (last.x !== view.ship.x || last.y !== view.ship.y)
            this.trail.push({ x: view.ship.x, y: view.ship.y });
    }

    private syncChart(view: PlayerView) {
        if (!this.images) return;
        const key = `${view.voyageMode}|${JSON.stringify(view.mapActions)}|${this.trail.map((p) => `${p.x},${p.y}`).join(";")}`;
        if (key === this.chartKey) return;
        this.chartKey = key;
        paintChart(
            this.chartPaint.ctx,
            this.chart,
            view.mapActions,
            this.trail,
            this.images,
        );
        this.chartPaint.texture.needsUpdate = true;
        this.placeKraken();
    }

    private syncShip(view: PlayerView) {
        if (!this.ship || this.shipHeld) return;
        this.ship.position.copy(this.chart.at(view.ship.x, view.ship.y));
        this.ship.rotation.set(0, headingYaw[view.ship.heading], 0);
    }

    private syncOffices(view: PlayerView) {
        const holders: Record<Office, string | undefined> = {
            captain: view.offices.captainId,
            firstMate: view.offices.firstMateId,
            navigator: view.offices.navigatorId,
        };
        for (const office of [
            "captain",
            "firstMate",
            "navigator",
        ] as Office[]) {
            const placed = this.offices.get(office);
            const at = this.slot(holders[office], "office");
            if (!placed) continue;
            const shown = placed.obj.visible;
            placed.obj.visible = Boolean(at) || placed.held;
            if (!at || placed.held) continue;
            placed.target.copy(at);
            if (shown && this.settled) continue;
            placed.obj.position.copy(at);
            if (this.settled) placed.enter = 0;
        }
    }

    /** Translucent tokens at the seats the captain is about to appoint. */
    private syncPending() {
        for (const office of ["firstMate", "navigator"] as const) {
            const placed = this.pendingOffices.get(office);
            const holder = this.ui.pending[office];
            const official =
                office === "firstMate"
                    ? this.view?.offices.firstMateId
                    : this.view?.offices.navigatorId;
            const at =
                holder && holder !== official
                    ? this.slot(holder, "office")
                    : undefined;
            if (!placed) continue;
            placed.obj.visible = Boolean(at);
            if (at) {
                placed.target.copy(at);
                placed.obj.position.copy(at);
            }
        }
    }

    private syncStatus(view: PlayerView) {
        this.syncSet(
            this.mugs,
            "mug",
            view.players.filter((p) => p.offDuty && !p.dead).map((p) => p.id),
            "off-duty",
            0.42,
            [0, -0.5, 0],
        );
        this.syncSet(
            this.knives,
            "knife",
            view.players.filter((p) => p.muted).map((p) => p.id),
            "knife",
            0.62,
            [0, 0.9, Math.PI / 2],
        );
    }

    private syncSet(
        set: Map<string, Placed>,
        slot: Slot,
        ids: string[],
        name: ModelName,
        size: number,
        rotation: [number, number, number],
    ) {
        const wanted = new Set(ids);
        for (const [id, placed] of set) {
            if (wanted.has(id)) continue;
            this.scene.remove(placed.obj);
            set.delete(id);
        }
        for (const id of wanted) {
            const at = this.slot(id, slot);
            const placed = set.get(id);
            if (placed && at) {
                placed.target.copy(at);
                continue;
            }
            const key = `${slot}:${id}`;
            if (this.loading.has(key) || !at) continue;
            const parked = this.unpark(key);
            if (parked) {
                set.set(id, {
                    obj: parked,
                    target: at.clone(),
                    yaw: 0,
                    held: false,
                    enter: 1,
                });
                continue;
            }
            this.loading.add(key);
            void prop(name, { size, rotation }).then((obj) => {
                this.loading.delete(key);
                if (this.disposed || set.has(id) || !this.view) return;
                const still = this.view.players.find((p) => p.id === id);
                if (
                    !still ||
                    !(slot === "mug"
                        ? still.offDuty && !still.dead
                        : still.muted)
                )
                    return;
                const target = this.slot(id, slot) ?? at;
                obj.add(contactShadow(this.kit, size * 1.1, size * 0.9));
                obj.position.copy(target);
                this.scene.add(obj);
                set.set(id, {
                    obj,
                    target: target.clone(),
                    yaw: 0,
                    held: false,
                    enter: this.settled ? 0 : 1,
                });
                this.touch();
            });
        }
    }

    private syncHand(view: PlayerView) {
        const cards = view.hand ?? [];
        const ids = new Set(cards.map((c) => c.id));
        for (const [id, piece] of this.hand) {
            if (ids.has(id)) continue;
            this.scene.remove(piece.card);
            this.hand.delete(id);
        }
        for (const id of this.taken) if (!ids.has(id)) this.taken.delete(id);
        if (!this.images) return;
        cards.forEach((card, i) => {
            if (this.hand.has(card.id) || this.taken.has(card.id)) return;
            const base = SPOTS.hand[i % SPOTS.hand.length]!.clone();
            const yaw = i % 2 ? -0.06 : 0.1;
            const parked = this.unpark(`hand:${card.id}`) as Card | undefined;
            const mesh = parked ?? this.cardOf(card, true);
            mesh.position.copy(base);
            mesh.rotation.set(0, yaw, 0);
            if (!parked) this.scene.add(mesh);
            this.hand.set(card.id, { card: mesh, base, yaw, lift: 0 });
        });
    }

    private syncHeld(view: PlayerView) {
        const office = HOLDER_PHASE[view.phase];
        const holder = office ? view.offices[office] : undefined;
        const someoneElse =
            holder && holder !== view.viewerId ? holder : undefined;
        if (someoneElse !== this.held.holder) {
            for (const card of this.held.cards) this.scene.remove(card);
            this.held = { holder: someoneElse, cards: [], dealt: false };
        }
        // Dealt once per holder: a choreography may have taken some of them since.
        if (!someoneElse || this.held.dealt || !this.images) return;
        this.held.dealt = true;
        const parked = this.unparkAll(`held:${someoneElse}`) as Card[];
        for (let i = 0; i < 2; i++) {
            const card = parked[i] ?? this.cardOf(undefined, false, 0.5);
            this.placeHeld(card, i);
            if (!parked[i]) this.scene.add(card);
            this.held.cards.push(card);
        }
    }

    /** Where the i-th of two face-down cards lies beside the seat holding them. */
    heldSpot(holder: string | undefined, i: number) {
        const at = this.slot(holder, "held");
        if (!at) return undefined;
        const seat = this.seat(holder)!;
        const along = new THREE.Vector3(
            -Math.sin(seat.angle),
            0,
            Math.cos(seat.angle),
        );
        return {
            position: at
                .add(along.multiplyScalar((i - 0.5) * 0.36))
                .setY(0.02 + i * 0.012),
            yaw: -seat.angle + (i - 0.5) * 0.3,
        };
    }

    private placeHeld(card: Card, i: number) {
        const spot = this.heldSpot(
            this.held.holder ?? this.view?.offices.captainId,
            i,
        );
        if (!spot) return;
        card.position.copy(spot.position);
        card.rotation.set(0, spot.yaw, Math.PI);
    }

    private syncDossier(view: PlayerView) {
        const { faction, role } = view.me;
        this.dossier.visible = Boolean(faction && role);
        if (!this.images || !faction || !role) return;
        const key = `${faction}|${role}`;
        if (key === this.dossierKey) return;
        this.dossierKey = key;
        setCardFace(
            this.dossierCard,
            this.kit.own(identityFace(faction, role, this.images)),
        );
        const back = this.kit.own(secretBack(this.images));
        this.dossierCard.userData.back.map = back;
        this.dossierCard.userData.back.color.set(0xffffff);
        this.dossierCard.userData.back.needsUpdate = true;
    }

    private syncReveal(view: PlayerView) {
        const card = view.lastRevealedCard;
        if (!card) {
            if (this.revealed) this.scene.remove(this.revealed.card);
            this.revealed = undefined;
            return;
        }
        if (this.revealed?.id === card.id || !this.images) return;
        if (this.revealed) this.scene.remove(this.revealed.card);
        const parked = this.unpark(`reveal:${card.id}`) as Card | undefined;
        const mesh = parked ?? this.cardOf(card, true);
        mesh.position.copy(SPOTS.reveal);
        mesh.rotation.set(0, REVEAL_YAW, 0);
        if (!parked) this.scene.add(mesh);
        this.revealed = { id: card.id, card: mesh };
    }

    private syncBook(view: PlayerView) {
        const key = `${view.publicLog.at(-1)?.seq ?? 0}|${view.roundNo}`;
        if (key === this.bookKey) return;
        this.bookKey = key;
        paintLogbook(
            this.book.left,
            this.book.right,
            view.publicLog,
            view.phase === "lobby" ? 0 : view.roundNo,
        );
        this.book.leftTex.needsUpdate = true;
        this.book.rightTex.needsUpdate = true;
    }

    private syncPlaque(view: PlayerView) {
        const key = `${view.phase}|${view.roundNo}`;
        if (key === this.plaqueKey) return;
        if (this.plaqueKey) this.plaqueBump = 1;
        this.plaqueKey = key;
        paintPlaque(this.plaque.ctx, view.phase, view.roundNo);
        this.plaque.texture.needsUpdate = true;
    }

    private syncTurn(view: PlayerView) {
        const ids =
            view.phase === "ended"
                ? []
                : waitingOn(view).ids.filter((id) => this.seats.has(id));
        while (this.turnGlows.length < ids.length) {
            const glow = glowPlane(this.kit, 1.5);
            this.scene.add(glow);
            this.turnGlows.push(glow);
        }
        this.turnGlows.forEach((glow, i) => {
            const seat = this.seat(ids[i]);
            glow.visible = Boolean(seat);
            if (seat) glow.position.copy(seat.position).setY(BEZEL_TOP + 0.006);
        });
        const single = ids.length === 1 ? this.seat(ids[0]) : undefined;
        this.pointer.visible = Boolean(single);
        if (single) this.pointer.rotation.y = -single.angle;
    }

    private deepTarget() {
        const view = this.view;
        if (!view) return 0;
        if (view.winner) return view.winner === "cult" ? 1 : 0;
        if (view.phase.startsWith("ritual_")) return 1;
        if (view.phase === "map_feed") return 0.85;
        const distance = victoryDistance(view.voyageMode);
        if (view.ship.y >= distance - 1 && Math.abs(view.ship.x) < distance)
            return 0.55;
        return 0;
    }

    // ── pieces that need art or models ──────────────────────────────────────

    private cardOf(
        card: NavigationCard | undefined,
        faceUp: boolean,
        size = 1,
    ) {
        const images = this.images!;
        const mesh = cardMesh(
            this.kit,
            card ? this.kit.own(navCardFace(card, images)) : undefined,
            this.kit.own(cardBack(images)),
            { w: size, d: size },
        );
        mesh.rotation.z = faceUp ? 0 : Math.PI;
        return mesh;
    }

    /** A loose card for a choreography to carry; `discard` it when it lands somewhere it disappears. */
    looseCard({
        card,
        ritual,
        faceUp,
        size = 1,
    }: {
        card?: NavigationCard;
        ritual?: CultRitualKind;
        faceUp: boolean;
        size?: number;
    }) {
        const images = this.images;
        const face = images
            ? ritual
                ? ritualFace(ritual, images)
                : card
                  ? navCardFace(card, images)
                  : undefined
            : undefined;
        const back = images
            ? cardBack(images, ritual ? "/art/secret.webp" : undefined)
            : undefined;
        const mesh = cardMesh(
            this.kit,
            face && this.kit.own(face),
            back && this.kit.own(back),
            { w: size, d: size },
        );
        mesh.rotation.z = faceUp ? 0 : Math.PI;
        this.scene.add(mesh);
        return mesh;
    }

    discard(obj: THREE.Object3D) {
        this.scene.remove(obj);
        this.touch();
    }

    /** Hands an object to the next view that needs one at the same place, instead of building a copy. */
    park(key: string, obj: THREE.Object3D) {
        const list = this.parked.get(key) ?? [];
        list.push(obj);
        this.parked.set(key, list);
        // Nothing claimed it: the view moved on without it.
        setTimeout(() => {
            const left = this.parked.get(key);
            if (!left?.includes(obj)) return;
            left.splice(left.indexOf(obj), 1);
            this.discard(obj);
        }, 4000);
    }

    private unpark(key: string) {
        const list = this.parked.get(key);
        const obj = list?.shift();
        if (list && !list.length) this.parked.delete(key);
        return obj;
    }

    private unparkAll(key: string) {
        const list = this.parked.get(key) ?? [];
        this.parked.delete(key);
        return list;
    }

    /** Takes one of your hand cards off the table's books, for a choreography to carry. */
    takeHand(id: string) {
        const piece = this.hand.get(id);
        if (!piece) return undefined;
        this.hand.delete(id);
        this.taken.add(id);
        return piece.card;
    }

    /** Takes one of the face-down cards in front of whoever holds them. */
    takeHeld() {
        return this.held.cards.pop();
    }

    get heldBy() {
        return this.held.holder;
    }

    office(office: Office) {
        return this.offices.get(office);
    }

    revealedCard() {
        return this.revealed;
    }

    shipModel() {
        return this.ship;
    }

    holdShip(held: boolean) {
        this.shipHeld = held;
        if (!held && this.view) this.syncShip(this.view);
    }

    markerToken(action: MapAction) {
        if (!this.images) return undefined;
        const token = markerToken(
            this.kit,
            this.kit.own(markerTexture(action, this.images)),
        );
        this.scene.add(token);
        return token;
    }

    /** A fresh copy of a model for a flight, e.g. the knife on its way to the tongueless. */
    async looseProp(
        name: ModelName,
        size: number,
        rotation: [number, number, number],
    ) {
        const obj = await prop(name, { size, rotation });
        if (this.disposed) return undefined;
        obj.add(contactShadow(this.kit, size * 1.1, size * 0.9));
        this.scene.add(obj);
        return obj;
    }

    private buildDeck(images: Art) {
        this.deck.clear();
        const back = this.kit.own(cardBack(images));
        for (let i = 0; i < 7; i++) {
            const card = cardMesh(this.kit, undefined, back);
            card.position.set(
                (this.kit.rand() - 0.5) * 0.04,
                0.0125 + i * 0.026,
                (this.kit.rand() - 0.5) * 0.04,
            );
            card.rotation.set(0, (this.kit.rand() - 0.5) * 0.08, Math.PI);
            this.deck.add(card);
        }
        this.deck.position.copy(SPOTS.deck);
        this.deck.rotation.y = 0.12;
    }

    private buildCoin(images: Art) {
        const coin = compassCoin(this.kit, this.kit.own(coinFace(images)));
        coin.visible = false;
        this.scene.add(coin);
        this.offices.set("navigator", {
            obj: coin,
            target: new THREE.Vector3(),
            yaw: 0,
            held: false,
            enter: 1,
        });
        const ghost = compassCoin(this.kit, this.kit.own(coinFace(images)));
        ghost.traverse((o) => {
            if (o instanceof THREE.Mesh)
                o.material = this.kit.own(
                    (o.material as THREE.Material).clone(),
                );
        });
        setOpacity(ghost, 0.45);
        ghost.visible = false;
        this.scene.add(ghost);
        this.pendingOffices.set("navigator", {
            obj: ghost,
            target: new THREE.Vector3(),
            yaw: 0,
            held: false,
            enter: 1,
        });
    }

    private async loadScenery() {
        const add = (
            obj: THREE.Group | undefined,
            at: THREE.Vector3,
            footprint = 1,
        ) => {
            if (!obj || this.disposed) return;
            obj.position.copy(at);
            if (footprint)
                obj.add(contactShadow(this.kit, footprint, footprint * 0.7));
            this.scene.add(obj);
        };
        const [ship, kraken, candle, pistol, helm, badge, mateGhost, tentacle] =
            await Promise.all([
                prop("ship-sails", { size: 0.95 }),
                prop("tentacle-small", { size: 0.62, rotation: [0, -0.4, 0] }),
                prop("candle", { size: 1.35, rotation: [0, 0.6, 0] }),
                prop("pistol", {
                    size: 1.15,
                    rotation: [0, 0.75, Math.PI / 2],
                }),
                prop(OFFICE_MODEL.captain.name, OFFICE_MODEL.captain),
                prop(OFFICE_MODEL.firstMate.name, OFFICE_MODEL.firstMate),
                prop(OFFICE_MODEL.firstMate.name, {
                    ...OFFICE_MODEL.firstMate,
                    ownMaterials: true,
                }),
                prop("tentacle", {
                    size: 2.5,
                    rotation: [0, 0.5, 0],
                    shadow: false,
                }),
            ]).catch((error) => {
                console.error("[table] models failed to load", error);
                return [];
            });
        if (this.disposed || !ship) return;
        this.ship = ship;
        ship.add(contactShadow(this.kit, 1.0, 0.6));
        this.scene.add(ship);
        this.kraken = kraken;
        this.krakenScale = 1;
        if (kraken) this.scene.add(kraken);
        this.bigTentacle = tentacle;
        if (tentacle) this.scene.add(tentacle);
        this.placeKraken();
        add(candle, SPOTS.candle, 1.2);
        this.flame.visible = true;
        add(pistol, SPOTS.pistol, 1.1);
        for (const [office, obj] of [
            ["captain", helm],
            ["firstMate", badge],
        ] as const) {
            if (!obj) continue;
            obj.add(contactShadow(this.kit, 0.7, 0.7));
            obj.visible = false;
            this.scene.add(obj);
            this.offices.set(office, {
                obj,
                target: new THREE.Vector3(),
                yaw: 0,
                held: false,
                enter: 1,
            });
        }
        if (mateGhost) {
            setOpacity(mateGhost, 0.45);
            mateGhost.visible = false;
            this.scene.add(mateGhost);
            this.pendingOffices.set("firstMate", {
                obj: mateGhost,
                target: new THREE.Vector3(),
                yaw: 0,
                held: false,
                enter: 1,
            });
        }
        if (this.view) this.apply(this.view);
        this.touch();
    }

    /** The kraken waits on its own hex; in the deep, a larger arm rises through the cell below it. */
    private placeKraken() {
        const layout = this.chart.layout;
        const lair = layout.cells.find((c) => c.kind === "cult");
        const throat =
            lair &&
            layout.cells.find((c) => c.column === 0 && c.row === lair.row - 1);
        if (this.kraken && lair)
            this.kraken.position.copy(this.chart.point(lair.x, lair.y));
        if (this.bigTentacle && throat) {
            const at = this.chart.point(throat.x, throat.y);
            this.bigTentacle.position.set(at.x + 0.5, -2.7, at.z - 0.2);
            this.bigTentacle.userData.home = -2.7;
            this.throatGlow.position.set(at.x, 0.5, at.z);
        }
    }

    // ── a choreography's handles ────────────────────────────────────────────

    /** Leans the camera toward `focus` by k (0 rests, 1 is a close look), with an optional jolt. */
    push(k: number, focus?: THREE.Vector3, shake?: { x: number; y: number }) {
        this.pushK = k;
        if (focus) this.pushFocus.copy(focus);
        this.shake.set(shake?.x ?? 0, shake?.y ?? 0);
        this.dirty = true;
    }

    rippleAt(at: THREE.Vector3, k: number) {
        this.ripple.visible = k > 0 && k < 1;
        this.ripple.position.set(at.x, CHART_Y + 0.004, at.z);
        this.ripple.scale.setScalar(0.25 + 0.75 * k);
        (this.ripple.material as THREE.MeshBasicMaterial).opacity =
            (1 - k) * 0.55;
        this.touch();
    }

    pulseSeat(id: string | undefined) {
        const seat = id ? this.seats.get(id) : undefined;
        if (seat) seat.pulse = 0.0001;
    }

    /** Darkens the room for a moment, e.g. while a ritual card is drawn. */
    darken(level: number) {
        this.deepPulse = level;
    }

    /** Marks a choreography as running, so the table draws every frame until it ends. */
    begin() {
        this.active++;
        return () => {
            this.active = Math.max(0, this.active - 1);
            this.touch();
        };
    }

    touch() {
        this.dirty = true;
        this.shadowsDirty = true;
    }

    // ── frames ──────────────────────────────────────────────────────────────

    private onPointer = (e: PointerEvent) => {
        if (e.pointerType === "touch") return;
        const r = this.canvas.getBoundingClientRect();
        this.leanTarget.set(
            ((e.clientX - r.left) / r.width - 0.5) * 2,
            ((e.clientY - r.top) / r.height - 0.5) * 2,
        );
    };

    private onPointerLeave = () => this.leanTarget.set(0, 0);

    private resize(host: HTMLElement) {
        const w = Math.max(1, host.clientWidth);
        const h = Math.max(1, host.clientHeight);
        this.width = w;
        this.height = h;
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
        this.renderer.setSize(w, h, false);
        const aspect = w / h;
        this.camera.aspect = aspect;
        if (aspect >= 1.45) {
            this.camera.fov = 36;
            this.home.set(0.3, 10.6, 10.2);
            this.look.set(0.3, 0, 0.75);
        } else if (aspect >= 1.05) {
            this.camera.fov = 40;
            this.home.set(0.2, 12.4, 11.4);
            this.look.set(0.1, 0, 0.7);
        } else {
            // Portrait: high above the chart so the ring and its slips fit the narrow width;
            // the logbook is off to the right, a tap away in the top bar.
            this.camera.fov = 52;
            this.home.set(-1.6, 19.5, 9.8);
            this.look.set(-1.6, 0, 1.3);
        }
        // On a phone the dock covers the lower part of the screen, so the picture is lifted above it.
        if (aspect < 1.05) this.camera.setViewOffset(w, h, 0, h * 0.2, w, h);
        else this.camera.clearViewOffset();
        this.camera.updateProjectionMatrix();
        this.touch();
    }

    private tick = (now: number) => {
        if (this.disposed) return false;
        const t = now / 1000;
        // Eased in real time even when frames are slow, so a weak device still settles on schedule.
        const dt = this.lastTick
            ? Math.min(0.25, (now - this.lastTick) / 1000)
            : 0;
        this.lastTick = now;
        const motion = motionEnabled();
        // Things moving need the shadows redrawn; the camera moving needs only a new frame.
        let moving = this.active > 0;
        let looking = this.pushK > 0;

        // The camera
        const before = this.lean.clone();
        this.lean.lerp(
            motion ? this.leanTarget : new THREE.Vector2(),
            ease(dt, 3),
        );
        if (before.distanceToSquared(this.lean) > 1e-7) looking = true;
        const cam = this.camera;
        cam.position.set(
            this.home.x + this.lean.x * 0.45,
            this.home.y - this.lean.y * 0.25,
            this.home.z + Math.abs(this.lean.x) * 0.1,
        );
        const look = this.look.clone();
        if (this.pushK > 0) {
            cam.position.lerp(
                this.pushFocus.clone().add(new THREE.Vector3(0.6, 6.2, 5.6)),
                this.pushK * 0.42,
            );
            look.lerp(this.pushFocus, this.pushK * 0.5);
        }
        cam.position.x += this.shake.x * 0.01;
        cam.position.y += this.shake.y * 0.01;
        cam.lookAt(look);

        // Seats glide when the circle reflows, drop in when someone boards, and swell on a pulse
        for (const seat of this.seats.values()) {
            const settled =
                Math.abs(seat.target - seat.angle) < 1e-4 &&
                seat.enter >= 1 &&
                seat.pulse === 0;
            if (settled) continue;
            seat.angle += (seat.target - seat.angle) * ease(dt, 6);
            if (Math.abs(seat.target - seat.angle) < 1e-4)
                seat.angle = seat.target;
            if (seat.enter < 1)
                seat.enter = motion
                    ? Math.min(1, seat.enter + dt / ENTER_S)
                    : 1;
            if (seat.pulse > 0)
                seat.pulse =
                    motion && seat.pulse < 1 ? seat.pulse + dt / 0.45 : 0;
            this.placeSeat(seat);
            moving = true;
        }

        // Tokens and props slide to their seats; new ones drop in
        for (const placed of [
            ...this.offices.values(),
            ...this.mugs.values(),
            ...this.knives.values(),
        ]) {
            if (placed.held) continue;
            const pos = placed.obj.position;
            const drop =
                placed.enter < 1
                    ? (1 - spring(placed.enter * ENTER_S, 0.55, 13)) * 0.8
                    : 0;
            if (placed.enter < 1)
                placed.enter = motion
                    ? Math.min(1, placed.enter + dt / ENTER_S)
                    : 1;
            const target = placed.target.clone().setY(placed.target.y + drop);
            if (pos.distanceToSquared(target) < 1e-7) continue;
            pos.lerp(target, ease(dt, 7));
            moving = true;
        }

        // Your cards rise toward you when chosen or hovered; the dossier turns over when opened
        for (const [id, piece] of this.hand) {
            const want =
                id === this.ui.chosenCardId
                    ? 1
                    : id === this.ui.hoverCardId
                      ? 0.55
                      : 0;
            if (Math.abs(want - piece.lift) < 1e-4) continue;
            piece.lift += (want - piece.lift) * ease(dt, 10);
            piece.card.position.set(
                piece.base.x,
                piece.base.y + piece.lift * 0.32,
                piece.base.z,
            );
            piece.card.rotation.set(piece.lift * 0.42, piece.yaw, 0);
            moving = true;
        }
        const chosen = this.ui.chosenCardId
            ? this.hand.get(this.ui.chosenCardId)
            : undefined;
        this.highlight.visible = Boolean(chosen);
        if (chosen) {
            this.highlight.position.set(
                chosen.card.position.x,
                0.012,
                chosen.card.position.z,
            );
            (this.highlight.material as THREE.MeshBasicMaterial).opacity =
                motion ? 0.55 + 0.25 * Math.sin(t * 2.4) : 0.7;
        }
        const flip = this.ui.dossierOpen ? 1 : 0;
        if (Math.abs(flip - this.dossierFlip) > 1e-4) {
            this.dossierFlip += (flip - this.dossierFlip) * ease(dt, 8);
            this.dossier.rotation.set(
                0,
                0.16,
                Math.PI * (1 - this.dossierFlip),
            );
            this.dossier.position.set(
                SPOTS.dossier.x,
                SPOTS.dossier.y + Math.sin(this.dossierFlip * Math.PI) * 0.35,
                SPOTS.dossier.z,
            );
            moving = true;
        }
        if (this.plaqueBump > 0) {
            this.plaqueBump = motion
                ? Math.max(0, this.plaqueBump - dt / 0.5)
                : 0;
            this.plaque.plaque.position.y =
                BEZEL_TOP + 0.04 + Math.sin(this.plaqueBump * Math.PI) * 0.08;
            moving = true;
        }

        // The room: candle, lantern and the deep
        const target = Math.max(this.deepTarget(), this.deepPulse);
        if (Math.abs(target - this.deepLevel) > 1e-3) {
            this.deepLevel += (target - this.deepLevel) * ease(dt, 2.2);
            moving = true;
        } else this.deepLevel = target;
        const deep = this.deepLevel;
        const flicker = motion
            ? 1 +
              0.08 * Math.sin(t * 7.3) +
              0.05 * Math.sin(t * 13.1 + 1.7) +
              0.04 * Math.sin(t * 31.7)
            : 1;
        this.candleLight.intensity = 16 * flicker * (1 - deep * 0.4);
        this.candleLight.color
            .setHex(0xff9a48)
            .lerp(new THREE.Color(0x8fd18a), deep * 0.65);
        this.flame.scale.set(0.55 * flicker, 0.75 * flicker, 1);
        this.throatGlow.intensity = deep * (10 + 2.5 * Math.sin(t * 1.3));
        this.lantern.intensity = 320 * (1 - deep * 0.86);
        this.hemi.intensity = 0.28 * (1 - deep * 0.8);
        this.renderer.toneMappingExposure = 1.08 - deep * 0.3;
        this.scene.environmentIntensity = 0.22 * (1 - deep * 0.75);
        const fog = this.scene.fog as THREE.Fog;
        fog.near = 15 - deep * 3;
        fog.far = 30 - deep * 6;
        fog.color.setHex(0x090604).lerp(new THREE.Color(0x041011), deep);
        (this.scene.background as THREE.Color).copy(fog.color);
        if (this.bigTentacle) {
            this.bigTentacle.position.y =
                (this.bigTentacle.userData.home as number) + deep * 2.55;
            this.bigTentacle.rotation.z = Math.sin(t * 0.8) * 0.05 * deep;
            this.bigTentacle.visible = deep > 0.02;
        }
        if (this.kraken)
            this.kraken.scale.setScalar(this.krakenScale * (1 + deep * 0.9));
        for (const glow of this.turnGlows)
            (glow.material as THREE.MeshBasicMaterial).opacity = motion
                ? 0.75 + 0.2 * Math.sin(t * 2.2)
                : 0.85;
        if (this.host.dataset.deep !== (deep > 0.5 ? "true" : "false"))
            this.host.dataset.deep = deep > 0.5 ? "true" : "false";

        // Draw every frame while something moves; otherwise the flame flickers at a gentler rate.
        // The draw waits for this frame's choreography paints, which run after this callback.
        if (moving) this.touch();
        else if (looking) this.dirty = true;
        if (
            (this.dirty || now - this.lastDraw > 1000 / 24) &&
            !this.drawQueued
        ) {
            this.drawQueued = true;
            queueMicrotask(this.draw);
        }
    };

    private get host() {
        return this.canvas.parentElement ?? document.body;
    }

    private draw = () => {
        this.drawQueued = false;
        if (this.disposed) return;
        if (this.shadowsDirty) this.renderer.shadowMap.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
        this.dirty = false;
        this.shadowsDirty = false;
        this.lastDraw = performance.now();
        this.pinOverlay();
    };

    private toScreen(v: THREE.Vector3) {
        const p = v.clone().project(this.camera);
        return {
            x: ((p.x + 1) / 2) * this.width,
            y: ((1 - p.y) / 2) * this.height,
        };
    }

    /** Moves the HTML that belongs to things on the table onto them. */
    private pinOverlay() {
        for (const seat of this.seats.values()) {
            const el = trackedElement(`slip:${seat.id}`);
            if (!el) continue;
            const at = this.toScreen(
                seat.seal.position.clone().setY(BEZEL_TOP + 0.08),
            );
            const edge = this.toScreen(
                seat.seal.position
                    .clone()
                    .setY(BEZEL_TOP + 0.08)
                    .add(new THREE.Vector3(0.3, 0, 0)),
            );
            el.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
            el.style.setProperty(
                "--seal",
                `${(Math.abs(edge.x - at.x) * 2).toFixed(1)}px`,
            );
            // A narrow screen has no room beside the outermost seals; their slips hang above or below.
            el.dataset.side =
                this.width < 560
                    ? Math.sin(seat.angle) > 0
                        ? "below"
                        : "above"
                    : sideOf(seat.angle);
            el.dataset.placed = "";
        }
        for (const [id, piece] of this.hand)
            this.pinCard(`card:${id}`, piece.card);
        if (this.dossier.visible) this.pinCard("dossier", this.dossierCard);
        this.pinBox("book", this.book.book, 2.375, 1.625, 0.15);
        const chart = trackedElement("chart");
        if (chart) {
            const centre = this.toScreen(CHART.clone().setY(CHART_Y));
            const edge = this.toScreen(
                CHART.clone()
                    .setY(CHART_Y)
                    .add(new THREE.Vector3(DISC_R, 0, 0)),
            );
            chart.style.transform = `translate(${centre.x.toFixed(1)}px, ${centre.y.toFixed(1)}px)`;
            chart.style.setProperty(
                "--chart",
                `${(Math.abs(edge.x - centre.x) * 2).toFixed(1)}px`,
            );
            chart.dataset.placed = "";
        }
    }

    private pinCard(id: string, card: Card) {
        this.pinBox(id, card, 0.64, 0.64, 0.02);
    }

    /** Sizes a button to the screen outline of a flat object's top face. */
    private pinBox(
        id: string,
        obj: THREE.Object3D,
        halfW: number,
        halfD: number,
        y: number,
    ) {
        const el = trackedElement(id);
        if (!el) return;
        obj.updateWorldMatrix(true, false);
        const corners = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
        ].map(([sx, sz]) =>
            this.toScreen(
                new THREE.Vector3(sx! * halfW, y, sz! * halfD).applyMatrix4(
                    obj.matrixWorld,
                ),
            ),
        );
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        el.style.left = `${left.toFixed(1)}px`;
        el.style.top = `${top.toFixed(1)}px`;
        el.style.width = `${(Math.max(...xs) - left).toFixed(1)}px`;
        el.style.height = `${(Math.max(...ys) - top).toFixed(1)}px`;
        el.style.clipPath = `polygon(${corners.map((c) => `${(c.x - left).toFixed(1)}px ${(c.y - top).toFixed(1)}px`).join(", ")})`;
        el.dataset.placed = "";
    }

    dispose() {
        this.disposed = true;
        this.leaveFrame();
        this.observer.disconnect();
        const host = this.canvas.parentElement;
        host?.removeEventListener("pointermove", this.onPointer);
        host?.removeEventListener("pointerleave", this.onPointerLeave);
        this.kit.dispose();
        this.env.dispose();
        this.renderer.dispose();
        this.canvas.remove();
    }
}
