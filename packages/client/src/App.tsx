import { useState } from "react";
import { Anchor, BookOpenText, SignOut, X } from "@phosphor-icons/react";
import { useAppStore } from "./store";
import { leaveGameRoom } from "./connection";
import { Lobby } from "./scenes/Lobby";
import { RoomView } from "./scenes/RoomView";
import { Rulebook } from "./components/Rulebook";
import "./styles.css";

export function App() {
  const { view, error, setError } = useAppStore();
  const [rulesOpen, setRulesOpen] = useState(false);
  return (
    <main className={view ? "app-shell at-sea" : "app-shell at-harbor"}>
      <nav className="topbar" aria-label="主导航">
        <span className="wordmark">
          <Anchor size={22} weight="light" aria-hidden="true" />
          <span>险恶疑航</span>
          <small>Feed the Kraken</small>
        </span>
        <div className="topbar-actions">
          <button className="quiet" onClick={() => setRulesOpen(true)}>
            <BookOpenText size={18} aria-hidden="true" />
            船员手册
          </button>
          {view && (
            <button className="quiet" onClick={leaveGameRoom}>
              <SignOut size={18} aria-hidden="true" />
              返回港口
            </button>
          )}
        </div>
      </nav>
      {error && (
        <div className="toast" role="alert" key={error}>
          <span>{error}</span>
          <button className="icon-button" onClick={() => setError(undefined)} aria-label="关闭提示">
            <X size={16} />
          </button>
        </div>
      )}
      {view ? <RoomView view={view} /> : <Lobby />}
      {rulesOpen && <Rulebook onClose={() => setRulesOpen(false)} />}
    </main>
  );
}
