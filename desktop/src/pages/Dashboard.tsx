// src/pages/Dashboard.tsx
import React from "react";
import { getDeviceState, type DeviceSnapshot } from "../api/device";
import LedPanel from "../components/LedPanel";
import MusicPanel from "../components/MusicPanel";

const POLL_MS = Math.max(500, Math.floor(Number(import.meta.env.VITE_MUSIC_POLL_SEC || 1) * 1000));

export default function Dashboard() {
    const [snap, setSnap] = React.useState<DeviceSnapshot | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [err, setErr] = React.useState<string | null>(null);

    const fetchState = React.useCallback(async () => {
        try {
            setErr(null);
            const s = await getDeviceState();
            setSnap(s);
            setLoading(false);
        } catch (e: any) {
            setErr(e?.message || "Erreur réseau");
        }
    }, []);

    React.useEffect(() => {
        fetchState();
        const t = setInterval(fetchState, POLL_MS);
        return () => clearInterval(t);
    }, [fetchState]);

    return (
        <div className="container">
            <header className="bar">
                <div>
                    <h1>Aura – Contrôle du miroir</h1>
                    <p className="sub">
                        Device: <code>{import.meta.env.VITE_DEVICE_ID}</code> • API: <code>{import.meta.env.VITE_API_URL}</code>
                    </p>
                </div>
                <button className="btn" onClick={fetchState} title="Rafraîchir">⟳</button>
            </header>

            {loading && <div className="notice">Chargement…</div>}
            {err && <div className="error">Erreur: {err}</div>}

            {snap && (
                <div className="grid">
                    <LedPanel leds={snap.leds} onRefresh={fetchState} />
                    <MusicPanel music={snap.music} onRefresh={fetchState} />
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
