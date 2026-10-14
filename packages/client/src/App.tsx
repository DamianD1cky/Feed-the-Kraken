import { lazy, Suspense, useEffect, useState } from "react";
import { GithubLogo, X } from "@phosphor-icons/react";
import { useAppStore, useStage } from "./store";
import { Lobby } from "./scenes/Lobby";
import { Rulebook } from "./components/Rulebook";
import { LogDrawer, TopBar, World } from "./components/Chrome";
import "./styles.css";

// The table brings three.js and the models; the harbour should not wait for them.
const loadTable = () => import("./scenes/Table");
const Table = lazy(() => loadTable().then((m) => ({ default: m.Table })));

export function App() {
    const error = useAppStore((s) => s.error);
    const setError = useAppStore((s) => s.setError);
    const connected = useAppStore((s) => s.connected);
    const stage = useStage();
    const [rulesOpen, setRulesOpen] = useState(false);
    const [logOpen, setLogOpen] = useState(false);
    const scene = stage ? "table" : "harbor";
    useEffect(() => {
        const id = window.setTimeout(() => void loadTable(), 1200);
        return () => window.clearTimeout(id);
    }, []);
    return (
        <main className="app-shell" data-scene={scene}>
            <World scene={scene} />
            <TopBar
                view={stage?.view}
                connected={connected}
                onRules={() => setRulesOpen(true)}
                onLog={() => setLogOpen(true)}
            />
            {error && (
                <div className="toast" role="alert" key={error}>
                    <span>{error}</span>
                    <button className="icon-button" onClick={() => setError(undefined)} aria-label="关闭提示">
                        <X size={16} />
                    </button>
                </div>
            )}
            {stage ? (
                <Suspense
                    fallback={
                        <p className="table-loading" role="status">
                            正在把海图铺上桌……
                        </p>
                    }
                >
                    <Table stage={stage} onOpenLog={() => setLogOpen(true)} />
                </Suspense>
            ) : (
                <>
                    <Lobby openRules={() => setRulesOpen(true)} />
                    <footer className="site-footer">
                        <a href="https://github.com/DamianDicky" target="_blank" rel="noreferrer">
                            <GithubLogo size={15} weight="light" aria-hidden="true" />
                            made by DamianDicky
                        </a>
                    </footer>
                </>
            )}
            {rulesOpen && <Rulebook onClose={() => setRulesOpen(false)} />}
            {logOpen && stage && (
                <LogDrawer
                    view={stage.view}
                    onClose={() => setLogOpen(false)}
                />
            )}
        </main>
    );
}
