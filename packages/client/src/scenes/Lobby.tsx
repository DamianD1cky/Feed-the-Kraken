import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Flask } from "@phosphor-icons/react";
import { MIN_PLAYERS } from "@feed/shared";
import { createGameRoom, joinGameRoom, preloadConnection, readInviteRoomId } from "../connection";
import { useAppStore } from "../store";
import { testModeEnabled } from "../testMode";
import { launchTestGame, readTestJoinIntent, waitForLaunchRoom } from "../testPlayers";

const TITLE = [..."险恶疑航"];

export function Lobby({ openRules }: { openRules(): void }) {
    const [inviteRoomId] = useState(readInviteRoomId);
    const [nickname, setNickname] = useState("");
    const [roomId, setRoomId] = useState(inviteRoomId);
    const [mode, setMode] = useState<"create" | "join">(inviteRoomId ? "join" : "create");
    const [busy, setBusy] = useState(false);
    const [testJoin] = useState(readTestJoinIntent);
    const testJoined = useRef(false);

    // 测试模式：从「一键 5 人局」打开的标签页带有 testjoin 参数，落地即等待房间号并自动加入。
    useEffect(() => {
        if (!testJoin || testJoined.current) return;
        testJoined.current = true;
        setNickname(testJoin.nickname);
        setMode("join");
        setBusy(true);
        void (async () => {
            try {
                await joinGameRoom(await waitForLaunchRoom(testJoin.token), testJoin.nickname);
            } catch (error) {
                useAppStore.getState().setError(error instanceof Error ? error.message : "无法加入房间");
                setBusy(false);
            }
        })();
    }, [testJoin]);

    async function embark(reconnect = false) {
        setBusy(true);
        useAppStore.getState().setError(undefined);
        try {
            if (mode === "create") await createGameRoom(nickname.trim());
            else
                await joinGameRoom(
                    roomId.trim(),
                    nickname.trim(),
                    reconnect ? "reconnect" : "new-player",
                );
        } catch (error) {
            useAppStore
                .getState()
                .setError(
                    error instanceof Error ? error.message : "无法连接港口",
                );
        } finally {
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
            const { opened, expected } = await launchTestGame(async () => {
                const room = await createGameRoom(nickname.trim() || "测试船长");
                return room.roomId;
            }, extra);
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
            <section className="lobby-content" data-embarking={busy || undefined}>
                <p className="eyebrow">A VOYAGE OF TRUST & TREACHERY</p>
                <h1 aria-label="险恶疑航 FEED THE KRAKEN">
                    <span className="title-cn" aria-hidden="true">
                        {TITLE.map((glyph, i) => (
                            <span key={i} style={{ "--i": i } as CSSProperties}>
                                {glyph}
                            </span>
                        ))}
                    </span>
                    <span className="title-en" aria-hidden="true">
                        FEED THE KRAKEN
                    </span>
                </h1>
                <p className="lobby-intro">
                    同舟，不同心。
                    <br />
                    最后一条航线，交给谁？
                </p>
                <form
                    className="embark-form"
                    onFocus={() => void preloadConnection()}
                    onPointerEnter={() => void preloadConnection()}
                    onSubmit={(event) => {
                        event.preventDefault();
                        void embark();
                    }}
                >
                    <Tabs mode={mode} onChange={setMode} />
                    <label>
                        船员称呼
                        <input
                            autoComplete="nickname"
                            maxLength={20}
                            value={nickname}
                            onChange={(event) =>
                                setNickname(event.target.value)
                            }
                            placeholder="让同伴记住你的名字"
                            required
                        />
                    </label>
                    {mode === "join" && (
                        <label className="embark-field">
                            房间号
                            <input
                                autoCapitalize="off"
                                autoComplete="off"
                                spellCheck={false}
                                value={roomId}
                                onChange={(event) =>
                                    setRoomId(event.target.value)
                                }
                                placeholder="输入朋友分享的房间号"
                                required
                            />
                            {inviteRoomId && roomId === inviteRoomId && (
                                <small className="field-hint">已从邀请链接填入</small>
                            )}
                        </label>
                    )}
                    <button
                        className="primary embark"
                        disabled={
                            busy ||
                            !nickname.trim() ||
                            (mode === "join" && !roomId.trim())
                        }
                    >
                        {busy ?
                            "正在登船…"
                        : mode === "create" ?
                            "创建房间 · 扬帆之前"
                        :   "作为新玩家加入"}
                        <span aria-hidden="true">→</span>
                    </button>
                    {mode === "join" && (
                        <button
                            type="button"
                            className="quiet embark-field"
                            disabled={busy || !roomId.trim()}
                            onClick={() => void embark(true)}
                        >
                            恢复上次身份 ↗
                        </button>
                    )}
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
                <div className="lobby-footnote">
                    <span>5–11 位船员 · 秘密阵营 · 请配合语音</span>
                    <button className="text-button" onClick={openRules}>
                        第一次上船？阅读手册 ↗
                    </button>
                </div>
            </section>
            <div className="harbor-caption">
                <span>THE HARBOR / 夜幕降临</span>
                <p>深海，正等着下一位访客。</p>
            </div>
        </div>
    );
}

/** Two tabs whose underline slides to the chosen one instead of jumping. */
function Tabs({ mode, onChange }: { mode: "create" | "join"; onChange(mode: "create" | "join"): void }) {
    const create = useRef<HTMLButtonElement>(null);
    const join = useRef<HTMLButtonElement>(null);
    const ink = useRef<HTMLSpanElement>(null);
    useLayoutEffect(() => {
        const active = (mode === "create" ? create : join).current;
        if (!active || !ink.current) return;
        ink.current.style.width = `${active.offsetWidth}px`;
        ink.current.style.transform = `translateX(${active.offsetLeft}px)`;
    }, [mode]);
    return (
        <div className="form-tabs" aria-label="登船方式">
            <button
                ref={create}
                type="button"
                className={mode === "create" ? "active" : ""}
                aria-pressed={mode === "create"}
                onClick={() => onChange("create")}
            >
                召集船员
            </button>
            <button
                ref={join}
                type="button"
                className={mode === "join" ? "active" : ""}
                aria-pressed={mode === "join"}
                onClick={() => onChange("join")}
            >
                凭房间号登船
            </button>
            <span ref={ink} className="form-tabs-ink" aria-hidden="true" />
        </div>
    );
}
