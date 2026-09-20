import { useState } from "react";
import { createGameRoom, joinGameRoom } from "../connection";
import { useAppStore } from "../store";
import { art } from "../labels";

export function Lobby({ openRules }: { openRules(): void }) {
    const [nickname, setNickname] = useState("");
    const [roomId, setRoomId] = useState("");
    const [mode, setMode] = useState<"create" | "join">("create");
    const [busy, setBusy] = useState(false);
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
    return (
        <div className="lobby">
            <img
                className="harbor-art"
                src={art.harbor}
                alt=""
                fetchPriority="high"
            />
            <div className="harbor-shade" />
            <section className="lobby-content">
                <p className="eyebrow">A VOYAGE OF TRUST & TREACHERY</p>
                <h1>
                    险恶疑航<span>FEED THE KRAKEN</span>
                </h1>
                <p className="lobby-intro">
                    同舟，不同心。
                    <br />
                    最后一条航线，交给谁？
                </p>
                <form
                    className="embark-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void embark();
                    }}
                >
                    <div className="form-tabs" aria-label="登船方式">
                        <button
                            type="button"
                            className={mode === "create" ? "active" : ""}
                            aria-pressed={mode === "create"}
                            onClick={() => setMode("create")}
                        >
                            召集船员
                        </button>
                        <button
                            type="button"
                            className={mode === "join" ? "active" : ""}
                            aria-pressed={mode === "join"}
                            onClick={() => setMode("join")}
                        >
                            凭房间号登船
                        </button>
                    </div>
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
                        <label>
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
                            className="quiet"
                            disabled={busy || !roomId.trim()}
                            onClick={() => void embark(true)}
                        >
                            恢复上次身份 ↗
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
