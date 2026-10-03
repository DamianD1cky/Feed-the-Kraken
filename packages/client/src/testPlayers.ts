import { TESTJOIN_NICK_PARAM, TESTJOIN_PARAM } from "./connection";

const LAUNCH_KEY_PREFIX = "feed-the-kraken:test-launch:";

// 随机昵称词库：形容词 × 名词 组合出足够多且互不相同的「测试·XX」名字。
const CREW_ADJECTIVES = [
    "沉着的", "豪爽的", "机灵的", "迷糊的", "爱笑的", "倔强的",
    "好奇的", "安静的", "爽朗的", "稳重的", "胆大的", "细心的",
    "慵懒的", "健谈的", "警觉的", "风趣的",
] as const;

const CREW_NOUNS = [
    "水手", "瞭望员", "舵手", "厨师", "木匠", "医生", "炮手", "乐师",
    "领航员", "甲板长", "桨手", "司炉", "桶匠", "绘图员", "守夜人", "补帆匠",
] as const;

function pick<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

/** 生成互不重复的随机测试昵称；每次调用结果都不同，且已去重（避免触发服务端重名校验）。 */
function randomCrewNames(count: number): string[] {
    const used = new Set<string>();
    const names: string[] = [];
    while (names.length < count) {
        const candidate = `测试·${pick(CREW_ADJECTIVES)}${pick(CREW_NOUNS)}`;
        if (used.has(candidate)) continue;
        used.add(candidate);
        names.push(candidate);
    }
    return names;
}

function launchUrl(token: string, nickname: string) {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set(TESTJOIN_PARAM, token);
    url.searchParams.set(TESTJOIN_NICK_PARAM, nickname);
    return url.toString();
}

/** 打开一个测试标签页；window.open 被拦截时退回真实链接点击，尽量绕过弹窗拦截。 */
function openTestTab(url: string): boolean {
    const win = window.open(url, "_blank");
    if (win) return true;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return false;
}

function openTestWindows(token: string, nicknames: string[]): number {
    let opened = 0;
    for (const nickname of nicknames) {
        if (openTestTab(launchUrl(token, nickname))) opened += 1;
    }
    return opened;
}

function publishLaunchRoom(token: string, roomId: string) {
    try {
        localStorage.setItem(LAUNCH_KEY_PREFIX + token, roomId);
    } catch {
        // 隐私模式等场景下 localStorage 不可用，测试窗口会一直等待并最终超时。
        return;
    }
    // 测试窗口各自读取后不删除，由发起方延时清理遗留键。
    window.setTimeout(() => {
        try {
            localStorage.removeItem(LAUNCH_KEY_PREFIX + token);
        } catch {
            // ignored
        }
    }, 60_000);
}

/**
 * 当前窗口是 1 号玩家：先同步打开 extra 个真实网页（落在用户手势内，避免被弹窗拦截），
 * 再创建房间并通过 localStorage 公布房间号，让这些网页落地后自动加入。昵称每次随机。
 */
export async function launchTestGame(createRoom: () => Promise<string>, extra: number) {
    const token = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const nicknames = randomCrewNames(extra);
    const opened = openTestWindows(token, nicknames);
    const roomId = await createRoom();
    publishLaunchRoom(token, roomId);
    return { opened, expected: extra };
}

/**
 * 房间已存在时（例如对局大厅里补人）：同步打开 count 个真实网页并立即公布房间号。
 * 返回实际成功打开的标签页数。
 */
export function openTestPlayerTabs(roomId: string, count: number): number {
    const token = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const nicknames = randomCrewNames(count);
    const opened = openTestWindows(token, nicknames);
    publishLaunchRoom(token, roomId);
    return opened;
}

export interface TestJoinIntent {
    token: string;
    nickname: string;
}

/** 测试网页落地时读取意图；不是测试网页时返回 undefined。 */
export function readTestJoinIntent(): TestJoinIntent | undefined {
    const params = new URLSearchParams(location.search);
    const token = params.get(TESTJOIN_PARAM)?.trim();
    const nickname = params.get(TESTJOIN_NICK_PARAM)?.trim();
    if (!token || !nickname) return undefined;
    return { token, nickname };
}

/** 轮询等待发起方写入房间号，最多等 30 秒。 */
export function waitForLaunchRoom(token: string, timeoutMs = 30_000): Promise<string> {
    const key = LAUNCH_KEY_PREFIX + token;
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
            let roomId: string | null = null;
            try {
                roomId = localStorage.getItem(key);
            } catch {
                roomId = null;
            }
            if (roomId) {
                resolve(roomId);
                return;
            }
            if (Date.now() - started >= timeoutMs) {
                reject(new Error("等待测试房间超时，请回到发起窗口重试。"));
                return;
            }
            window.setTimeout(tick, 120);
        };
        tick();
    });
}
