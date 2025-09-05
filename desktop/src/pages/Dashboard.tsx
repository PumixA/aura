import React from "react";
import { getDeviceState, type DeviceSnapshot } from "../api/device";
import LedPanel from "../components/LedPanel";
import MusicPanel from "../components/MusicPanel";
import OwnerPanel from "../components/OwnerPanel";

const POLL_MS = Math.max(
    500,
    Math.floor(Number(import.meta.env.VITE_MUSIC_POLL_SEC || 1) * 1000)
);

export default function Dashboard() {
    const [snap, setSnap] = React.useState<DeviceSnapshot | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [err, setErr] = React.useState<string | null>(null);

    const [lastOkAt, setLastOkAt] = React.useState<number | null>(null);
    const online = React.useMemo(() => {
        if (!lastOkAt) return false;
        return Date.now() - lastOkAt <= POLL_MS * 1.5; // tolérance
    }, [lastOkAt]);

    const fetchState = React.useCallback(async () => {
        try {
            setErr(null);
            const s = await getDeviceState();
            setSnap(s);
            setLoading(false);
            setLastOkAt(Date.now());
        } catch (e: any) {
            setErr(e?.message || "Erreur réseau");
        }
    }, []);

    React.useEffect(() => {
        fetchState();
        const t = setInterval(fetchState, POLL_MS);
        return () => clearInterval(t);
    }, [fetchState]);

    const lastUpdateStr =
        lastOkAt ? new Date(lastOkAt).toLocaleTimeString() : "—";

    return (
        <div className="container">
            <header className="bar">
                <div>
                    <h1>Aura – Contrôle du miroir</h1>
                    <p className="sub">
                        Device: <code>{import.meta.env.VITE_DEVICE_ID}</code> • API:{" "}
                        <code>{import.meta.env.VITE_API_URL}</code>
                    </p>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div
                        title={online ? "Miroir en ligne" : "Miroir hors ligne"}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            fontSize: 12,
                        }}
                    >
            <span
                style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: online ? "#22c55e" : "#ef4444",
                    boxShadow: online
                        ? "0 0 8px rgba(34,197,94,.7)"
                        : "0 0 6px rgba(239,68,68,.6)",
                }}
            />
                        <span style={{ opacity: 0.9 }}>
              {online ? "En ligne" : "Hors ligne"}
            </span>
                        <span style={{ opacity: 0.6, marginLeft: 6 }}>
              (maj {lastUpdateStr})
            </span>
                    </div>

                    <button className="btn" onClick={fetchState} title="Rafraîchir">
                        ⟳
                    </button>
                </div>
            </header>

            <div className="card" style={{ marginTop: 16 }}>
                <div className="card-head" style={{ marginBottom: 8 }}>
                    <h2 style={{ margin: 0 }}>Propriétaire & Pairing</h2>
                </div>
                <OwnerPanel />
            </div>

            {loading && <div className="notice">Chargement…</div>}
            {err && <div className="error">Erreur: {err}</div>}

            {snap && (
                <div className="grid">
                    <div className="card">
                        <div className="card-head">
                            <h2>Éclairage</h2>
                        </div>
                        <LedPanel leds={snap.leds} onRefresh={fetchState} />
                    </div>

                    <div className="card">
                        <div className="card-head">
                            <h2>Musique</h2>
                        </div>
                        <MusicPanel music={snap.music} onRefresh={fetchState} />
                    </div>
                </div>
            )}

            {snap && (
                <div className="card" style={{ marginTop: 16 }}>
                    <div className="card-head">
                        <h2>Widgets</h2>
                    </div>
                    <pre className="pre">{JSON.stringify(snap.widgets, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
