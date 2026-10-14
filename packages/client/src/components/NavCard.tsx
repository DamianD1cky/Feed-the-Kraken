import type { CSSProperties } from "react";
import type { NavigationCard } from "@feed/shared";
import { art, effectHints, effectLabels, navFaceArt } from "../labels";

type CardProps = { card?: NavigationCard; faceUp?: boolean; className?: string; plaque?: boolean };

/** A navigation card with both faces; `faceUp` turns it over on a spring. */
export function NavCard({ card, faceUp = true, className = "", plaque = true }: CardProps) {
    return (
        <span
            className={`nav-card ${className}`}
            data-dir={card?.direction}
            style={{ "--flip": faceUp && card ? "0deg" : "180deg" } as CSSProperties}
        >
            <span className="card-flipper">
                <span className="card-face card-front">
                    {card && <img src={navFaceArt[card.direction]} alt="" draggable={false} />}
                    {card && plaque && (
                        <span className="card-plaque">
                            <b>{effectLabels[card.effect]}</b>
                            <small>{effectHints[card.effect]}</small>
                        </span>
                    )}
                </span>
                <span className="card-face card-back">
                    <img src={art.navBack} alt="" draggable={false} />
                </span>
            </span>
        </span>
    );
}
