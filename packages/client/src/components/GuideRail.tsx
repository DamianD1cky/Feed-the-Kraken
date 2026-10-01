import type { ReactNode } from "react";
import { Compass, HandFist, Scroll, WifiSlash } from "@phosphor-icons/react";
import { art, cardArt, identityArt } from "../labels";

type Entry = { name: string; text: string; icon: ReactNode };
type Group = { title: string; entries: Entry[] };

const picture = (src: string) => <img src={src} alt="" loading="lazy" decoding="async" />;
const glyph = (icon: ReactNode) => <span className="guide-glyph">{icon}</span>;

const groups: Group[] = [
    {
        title: "职位",
        entries: [
            { name: "船长", icon: picture(art.captain), text: "任命大副和领航员；航行时抽 2 张，保留 1 张。" },
            { name: "大副", icon: picture(art.mate), text: "抽 2 张保留 1 张，与船长的牌一起交给领航员。" },
            {
                name: "领航员",
                icon: glyph(<Compass size={22} weight="light" />),
                text: "从两张保留牌中选 1 张执行；不愿执行时可以跳船抗命。",
            },
        ],
    },
    {
        title: "物品与状态",
        entries: [
            { name: "手枪", icon: picture(art.gun), text: "叛变时秘密投入。全船合计达到门槛即叛变，船长换人。" },
            { name: "下班", icon: picture(art.rest), text: "本轮不能被任命为大副或领航员，人手不足时除外。" },
            {
                name: "简历",
                icon: glyph(<Scroll size={22} weight="light" />),
                text: "执行过的航行牌数。醉酒时船长交给简历最少的人。",
            },
            {
                name: "已握拳",
                icon: glyph(<HandFist size={22} weight="light" />),
                text: "已提交本次叛变的枪数，具体数量保密。",
            },
            {
                name: "离线与离船",
                icon: glyph(<WifiSlash size={22} weight="light" />),
                text: "离线可恢复身份；离船者不再行动，但仍参与阵营胜负。",
            },
        ],
    },
    {
        title: "海图行动",
        entries: [
            { name: "搜查", icon: picture(art.detect), text: "船长私下查看目标阵营，目标此后不可被皈依。" },
            { name: "鞭笞", icon: picture(art.lash), text: "随机公开目标「不是」的一个阵营，目标不可被皈依。" },
            { name: "割舌", icon: picture(art.knife), text: "目标不能再说话，也不能成为船长。" },
            { name: "献祭", icon: picture(art.ritual), text: "目标出局；若是邪教领袖，邪教立即获胜。" },
        ],
    },
    {
        title: "航行牌",
        entries: [
            { name: "东方 · 蓝", icon: picture(cardArt.east), text: "向水手终点前进。牌效：醉酒、缴械。" },
            { name: "西方 · 红", icon: picture(cardArt.west), text: "向海盗终点前进。牌效：醉酒、美人鱼、望远镜、武装。" },
            { name: "北方 · 黄", icon: picture(cardArt.north), text: "向克拉肯前进。牌效：邪教起义。" },
        ],
    },
    {
        title: "牌效",
        entries: [
            { name: "醉酒", icon: glyph("醉"), text: "船长交给简历最少的下一位船员。" },
            { name: "缴械与武装", icon: glyph("枪"), text: "领航员分别失去或获得 1 把枪。" },
            { name: "美人鱼", icon: glyph("鱼"), text: "一名船员查看最近 3 张弃牌，可以撒谎。" },
            { name: "望远镜", icon: glyph("望"), text: "一名船员查看牌堆顶，可放回或弃入深海。" },
            { name: "邪教起义", icon: glyph("邪"), text: "本次航行结束时进行一次邪教仪式。" },
        ],
    },
    {
        title: "阵营",
        entries: [
            { name: "水手", icon: picture(identityArt.sailor), text: "把船开到东方终点。" },
            { name: "海盗", icon: picture(identityArt.pirate), text: "把船开到西方终点，开局海盗互相认识。" },
            { name: "邪教", icon: picture(identityArt.cult), text: "抵达克拉肯，或让领袖被献祭；可以皈依其他船员。" },
        ],
    },
];

export function GuideRail() {
    return (
        <aside className="side-rail guide-rail" aria-labelledby="guide-title">
            <div className="rail-heading">
                <h2 id="guide-title">航海指南</h2>
            </div>
            {groups.map((group) => (
                <details key={group.title} className="guide-group">
                    <summary>{group.title}</summary>
                    <dl>
                        {group.entries.map((entry) => (
                            <div key={entry.name} className="guide-entry">
                                <span className="guide-icon" aria-hidden="true">
                                    {entry.icon}
                                </span>
                                <dt>
                                    <strong>{entry.name}</strong>
                                </dt>
                                <dd>{entry.text}</dd>
                            </div>
                        ))}
                    </dl>
                </details>
            ))}
        </aside>
    );
}
