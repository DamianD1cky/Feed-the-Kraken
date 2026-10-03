import { useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, ArrowRight, Flask } from "@phosphor-icons/react";
import { MIN_PLAYERS } from "@feed/shared";
import { createGameRoom, joinGameRoom, preloadConnection, readInviteRoomId } from "../connection";
import { useAppStore } from "../store";
import { art } from "../labels";
import { testModeEnabled } from "../testMode";
import { launchTestGame, readTestJoinIntent, waitForLaunchRoom } from "../testPlayers";

type Mode = "create" | "join";

export function Lobby() {
    const [inviteRoomId] = useState(readInviteRoomId);
    const [nickname, setNickname] = useState("");
    const [roomId, setRoomId] = useState(inviteRoomId);
    const [mode, setMode] = useState<Mode>(inviteRoomId ? "join" : "create");
    const [busy, setBusy] = useState(false);
    const [artReady, setArtReady] = useState(false);
    const [testJoin] = useState(readTestJoinIntent);
    const testJoinedRef = useRef(false);
    const error = useAppStore((state) => state.error);
    const joining = mode === "join";

    useEffect(() => {
        if (error) setBusy(false);
    }, [error]);

    // 测试模式：从「一键 5 人局」打开的标签页带有 testjoin 参数，落地即等待房间号并自动加入。
    useEffect(() => {
        if (!testJoin || testJoinedRef.current) return;
        testJoinedRef.current = true;
        setNickname(testJoin.nickname);
        setMode("join");
        setBusy(true);
        void (async () => {
            try {
                const roomId = await waitForLaunchRoom(testJoin.token);
                await joinGameRoom(roomId, testJoin.nickname);
            } catch (joinError) {
                useAppStore.getState().setError(joinError instanceof Error ? joinError.message : "无法加入房间");
                setBusy(false);
            }
        })();
    }, [testJoin]);

    const canSubmit = !busy && nickname.trim() !== "" && (!joining || roomId.trim() !== "");

    async function embark(reconnect = false) {
        setBusy(true);
        useAppStore.getState().setError(undefined);
        try {
            if (joining) await joinGameRoom(roomId.trim(), nickname.trim(), reconnect ? "reconnect" : "new-player");
            else await createGameRoom(nickname.trim());
        } catch (error) {
            useAppStore.getState().setError(error instanceof Error ? error.message : "无法连接港口");
            setBusy(false);
        }
    }

    async function startTestVoyage() {
        setBusy(true);
        useAppStore.getState().setError(undefined);
        try {
            // 本窗口是 1 号玩家；先同步打开 4 个真实网页（落在用户手势内，避免被弹窗拦截），
            // 再创建房间并公布房间号，让这些网页自动加入，凑满 5 人真机局。
            const extra = MIN_PLAYERS - 1;
            const { opened, expected } = await launchTestGame(
                async () => {
                    const room = await createGameRoom(nickname.trim() || "测试船长");
                    return room.roomId;
                },
                extra,
            );
            if (opened < expected) {
                useAppStore
                    .getState()
                    .setError(`只成功打开了 ${opened}/${expected} 个测试窗口。若浏览器拦截了弹窗，请点击地址栏的弹窗拦截图标并选择「始终允许此网站的弹出式窗口」，然后重试。`);
            }
        } catch (error) {
            useAppStore.getState().setError(error instanceof Error ? error.message : "无法创建测试房间");
            setBusy(false);
        }
    }

    return (
        <div className="lobby">
            <div className="harbor-backdrop" aria-hidden="true">
                <img
                    ref={(img) => {
                        if (img?.complete) setArtReady(true);
                    }}
                    className={artReady ? "is-ready" : ""}
                    src={art.harbor}
                    srcSet={art.harborSrcSet}
                    sizes="100vw"
                    alt=""
                    fetchPriority="high"
                    decoding="async"
                    onLoad={() => setArtReady(true)}
                />
            </div>
            <div className="lobby-scroll">
                <section className="lobby-content">
                    <h1 className="lobby-title">
                        险恶疑航
                        <span lang="en">Feed the Kraken</span>
                    </h1>
                    <p className="lobby-intro">同舟不同心。5 至 11 位船员，一条航线，各怀目的。</p>
                    <form
                        className="embark-form"
                        aria-busy={busy}
                        onFocus={() => void preloadConnection()}
                        onPointerEnter={() => void preloadConnection()}
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (canSubmit) void embark();
                        }}
                    >
                        <div className="form-tabs" data-mode={mode} role="tablist" aria-label="登船方式">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={!joining}
                                onClick={() => setMode("create")}
                            >
                                创建房间
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={joining}
                                onClick={() => setMode("join")}
                            >
                                加入房间
                            </button>
                        </div>
                        <label className="field">
                            <span>你的名字</span>
                            <input
                                autoComplete="nickname"
                                maxLength={20}
                                value={nickname}
                                onChange={(event) => setNickname(event.target.value)}
                                placeholder="同伴会看到这个名字"
                                required
                            />
                        </label>
                        <div className="reveal" data-open={joining} inert={!joining}>
                            <div>
                                <label className="field">
                                    <span>房间号</span>
                                    <input
                                        className="room-input"
                                        autoCapitalize="off"
                                        autoComplete="off"
                                        spellCheck={false}
                                        value={roomId}
                                        onChange={(event) => setRoomId(event.target.value)}
                                        placeholder="朋友分享给你的房间号"
                                        required={joining}
                                    />
                                    {inviteRoomId && roomId === inviteRoomId && (
                                        <small className="field-hint">已从邀请链接填入</small>
                                    )}
                                </label>
                            </div>
                        </div>
                        <button className="primary embark" disabled={!canSubmit} data-busy={busy || undefined}>
                            <span>{busy ? "正在连接" : joining ? "加入房间" : "创建房间"}</span>
                            <ArrowRight size={18} weight="bold" aria-hidden="true" />
                        </button>
                        <div className="reveal" data-open={joining} inert={!joining}>
                            <div>
                                <button
                                    type="button"
                                    className="quiet restore"
                                    disabled={busy || !roomId.trim()}
                                    onClick={() => void embark(true)}
                                >
                                    <ArrowCounterClockwise size={16} aria-hidden="true" />
                                    恢复上次身份
                                </button>
                            </div>
                        </div>
                        <p className="form-note">游戏内没有语音，开局前请先接通语音通话。</p>
                        {testModeEnabled && (
                            <button
                                type="button"
                                className="quiet test-button"
                                disabled={busy}
                                onClick={() => void startTestVoyage()}
                            >
                                <Flask size={16} aria-hidden="true" />
                                测试模式：一键 5 人局（开 4 个新网页）
                            </button>
                        )}
                    </form>
                </section>
            </div>
        </div>
    );
}
