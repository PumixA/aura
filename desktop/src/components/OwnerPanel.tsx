import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import {
    getOwner,
    unpairDevice,
    createPairingToken,
    buildPairingQrPayload,
    OwnerInfo,
} from "../api/device";

export default function OwnerPanel() {
    const [owner, setOwner] = useState<OwnerInfo>(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [transfer, setTransfer] = useState(false);
    const [qrValue, setQrValue] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);

    async function refresh() {
        try {
            setLoading(true);
            setOwner(await getOwner());
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        refresh();
    }, []);

    const prettyOwner = useMemo(() => {
        if (!owner) return "Non assigné";
        const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim();
        return name ? `${name} <${owner.email}>` : owner.email;
    }, [owner]);

    async function handleGenerateQR() {
        try {
            setGenerating(true);
            const resp = await createPairingToken(transfer);
            const payload = JSON.stringify(buildPairingQrPayload(resp));
            setQrValue(payload);
            setExpiresAt(resp.expiresAt);
        } finally {
            setGenerating(false);
        }
    }

    async function handleUnpair() {
        if (!confirm("Dissocier l'appareil de son propriétaire ?")) return;
        await unpairDevice();
        setQrValue(null);
        setExpiresAt(null);
        await refresh();
    }

    return (
        <div
            style={{
                display: "grid",
                gap: 12,
                padding: 16,
                borderRadius: 16,
                background:
                    "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
                border: "1px solid rgba(255,255,255,0.08)",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>Propriétaire</strong>
                <small style={{ opacity: 0.7 }}>{loading ? "chargement…" : ""}</small>
            </div>

            <div
                style={{
                    fontSize: 14,
                    opacity: 0.95,
                    background: "rgba(0,0,0,.25)",
                    padding: 8,
                    borderRadius: 10,
                }}
            >
                {prettyOwner}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={transfer} onChange={(e) => setTransfer(e.target.checked)} />
                    <span>QR de transfert</span>
                </label>
                <button
                    onClick={handleGenerateQR}
                    disabled={generating}
                    style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,.08)",
                        border: "1px solid rgba(255,255,255,.2)",
                    }}
                >
                    {generating ? "Génération…" : "Générer QR d’appairage"}
                </button>
                <button
                    onClick={handleUnpair}
                    style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: "rgba(255,0,0,.12)",
                        border: "1px solid rgba(255,0,0,.3)",
                    }}
                >
                    Dissocier
                </button>
                <button
                    onClick={refresh}
                    style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,.08)",
                        border: "1px solid rgba(255,255,255,.2)",
                    }}
                >
                    Rafraîchir
                </button>
            </div>

            {qrValue && (
                <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
                    <QRCode value={qrValue} size={160} />
                    <small style={{ opacity: 0.8 }}>
                        {transfer ? "QR TRANSFERT" : "QR APPAIRAGE"}
                        {expiresAt ? ` — expire ${new Date(expiresAt).toLocaleString()}` : ""}
                    </small>
                </div>
            )}
        </div>
    );
}
