import { useState } from "react";
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
        <span className="wordmark"><span aria-hidden="true">✦</span> FEED THE KRAKEN</span>
        <div><button className="quiet" onClick={() => setRulesOpen(true)}>船员手册 ↗</button>{view && <button className="quiet" onClick={leaveGameRoom}>返回港口</button>}</div>
      </nav>
      {error && <div className="error" role="alert"><span>{error}</span><button className="quiet" onClick={() => setError(undefined)} aria-label="关闭错误提示">×</button></div>}
      {view ? <RoomView view={view} /> : <Lobby openRules={() => setRulesOpen(true)} />}
      {rulesOpen && <Rulebook onClose={() => setRulesOpen(false)} />}
    </main>
  );
}
