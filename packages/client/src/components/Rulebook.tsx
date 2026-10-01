import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";

export function Rulebook({ onClose }: { onClose(): void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const trigger = document.activeElement;
        const modal = dialog.current;
        modal?.showModal();
        return () => {
            modal?.close();
            if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
        };
    }, []);
    return (
        <dialog
            ref={dialog}
            className="rulebook"
            onCancel={onClose}
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            aria-labelledby="rules-title"
        >
            <header>
                <h2 id="rules-title">船员手册</h2>
                <button className="icon-button" onClick={onClose} aria-label="关闭船员手册">
                    <X size={18} />
                </button>
            </header>
            <p className="rule-lead">一艘船，三个目的地。你可以撒谎，但别让别人看到你的秘密。</p>
            <section>
                <h3>你的目的地</h3>
                <dl>
                    <dt>水手，向东</dt>
                    <dd>抵达水手终点，与水手同伴共同获胜。</dd>
                    <dt>海盗，向西</dt>
                    <dd>抵达海盗终点；开局海盗互相认识。</dd>
                    <dt>邪教，向北</dt>
                    <dd>
                        抵达克拉肯，或让邪教领袖被喂食克拉肯。领袖跳船不会触发献祭胜利。被皈依后改为帮助邪教。
                    </dd>
                </dl>
            </section>
            <section>
                <h3>每轮如何进行</h3>
                <ol>
                    <li>船长任命大副和领航员。下班者不能被任命，人手不足时才忽略下班限制。</li>
                    <li>
                        除船长外的存活船员秘密握枪。按开局人数：5 至 7 人需 3 枪，8 至 9 人需 4 枪，10 至 11 人需 5 枪。
                    </li>
                    <li>
                        叛变成功：亮出的枪全部消耗，最多者成为船长。平手由现船长先剔除一人，再由被剔除者接力裁决。失败则所有枪收回。
                    </li>
                    <li>船长、大副各抽 2 留 1；两张保留牌洗匀交给领航员，选 1 张执行。选牌期间保持沉默。</li>
                    <li>依次结算：移动船只、检查终点、地图行动、航行牌效果、邪教仪式、下班轮换。</li>
                </ol>
            </section>
            <section>
                <h3>海图与牌效</h3>
                <p>
                    搜查：船长私看目标阵营。鞭笞：随机公开目标「不是」的一个阵营。两者都让目标免于皈依。献祭：目标出局；若是领袖，邪教立即获胜。
                </p>
                <p>
                    割舌者不可再说话，也不能成为船长，仍可任其他职位和亮枪。醉酒按简历轮换船长；缴械和武装分别使领航员减少或增加 1 枪。
                </p>
                <p>
                    美人鱼查看本轮 3 张弃牌，顺序打乱；望远镜查看牌堆顶，可放回或弃掉。领航员跳船后出局，紧急航行跳过叛变。
                </p>
                <p>邪教仪式共 5 张：3 次皈依、1 次分配 3 枪、1 次窥视航行团队。没有存活领袖时，仪式无效。</p>
            </section>
            <section>
                <h3>开局前约定</h3>
                <p>
                    5 至 6 人快速航行，7 人可选快速或漫长，8 至 11 人漫长。快速 19 张航行牌，漫长 23 张。每人初始 3
                    枪；漫长航行首次越过补给线，将不足 3 枪者补到 3 枪。
                </p>
                <p>
                    下班按开局人数决定：5 至 6 人仅领航员；7 至 8 人加大副；9
                    人起再加船长。离船不改变下班牌数量，下一次成功航行后替换下班名单。
                </p>
                <p>请自行开启语音。离船者保持沉默，不揭示身份与弃牌，仍参与阵营胜负。</p>
            </section>
            <aside className="rule-note">
                <strong>当前版本：简化海图</strong>
                <p>
                    坐标向东、西、北移动一步。快速终点为 x = ±3 或 y = 3，漫长为 ±4 或 4；漫长首次到达 |x| ≥ 2 或 y ≥ 2
                    时补给。地图行动标在航图上，触发后移除。尚未实现原版逐格箭头海图和 22
                    张角色异能；身份牌中的水手、海盗、邪教为阵营身份。
                </p>
            </aside>
        </dialog>
    );
}
