import React, { useState } from "react";
import { clsx } from "clsx";
import type { LedState } from "../api/device";
import { ledsSetPower, ledsSetStyle } from "../api/device";

type Props = {
    leds: LedState;
    onRefresh: () => void;
};

export default function LedPanel({ leds, onRefresh }: Props) {
    const [busy, setBusy] = useState(false);
    const [local, setLocal] = useState<LedState>(leds);

    React.useEffect(() => setLocal(leds), [leds]);

    async function togglePower() {
        try {
            setBusy(true);
            await ledsSetPower(!local.on);
            onRefresh();
        } finally {
            setBusy(false);
        }
    }

    async function changeColor(e: React.ChangeEvent<HTMLInputElement>) {
        const color = e.target.value.toUpperCase();
        setLocal((prev) => ({ ...prev, color }));
        try {
            setBusy(true);
            await ledsSetStyle({ color });
            onRefresh();
        } finally {
            setBusy(false);
        }
    }

    async function changeBrightness(e: React.ChangeEvent<HTMLInputElement>) {
        const brightness = Number(e.target.value);
        setLocal((prev) => ({ ...prev, brightness }));
        try {
            setBusy(true);
            await ledsSetStyle({ brightness });
            onRefresh();
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="card">
            <div className="card-head">
                <h2>Éclairage</h2>
                <button
                    className={clsx("btn", local.on ? "btn-on" : "btn-off")}
                    disabled={busy}
                    onClick={togglePower}
                    title={local.on ? "Éteindre" : "Allumer"}
                >
                    {local.on ? "ON" : "OFF"}
                </button>
            </div>

            <div className="row">
                <label>Couleur</label>
                <input
                    type="color"
                    value={local.color || "#FFFFFF"}
                    onChange={changeColor}
                    disabled={busy || !local.on}
                    style={{ width: 48, height: 32, border: "none", background: "transparent" }}
                />
                <code style={{ opacity: 0.7, marginLeft: 8 }}>{local.color}</code>
            </div>

            <div className="row">
                <label>Intensité</label>
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={local.brightness ?? 0}
                    onChange={changeBrightness}
                    disabled={busy || !local.on}
                    style={{ flex: 1 }}
                />
                <span className="mono">{local.brightness}%</span>
            </div>
        </div>
    );
}
