import React, { useState, useEffect } from "react";
import type { MusicState } from "../api/device";
import { musicCmd, musicSetVolume } from "../api/device";

type Props = {
    music: MusicState;
    onRefresh: () => void;
};

export default function MusicPanel({ music, onRefresh }: Props) {
    const [busy, setBusy] = useState(false);
    const [vol, setVol] = useState(music.volume);

    useEffect(() => setVol(music.volume), [music.volume]);

    async function setVolume(v: number) {
        setVol(v);
        setBusy(true);
        try {
            await musicSetVolume(v);
            onRefresh();
        } finally {
            setBusy(false);
        }
    }

    async function doAction(action: "play"|"pause"|"next"|"prev") {
        setBusy(true);
        try {
            await musicCmd(action);
            onRefresh();
        } finally {
            setBusy(false);
        }
    }

    const isPlaying = music.status === "play";

    return (
        <div className="card">
            <div className="card-head">
                <h2>Musique</h2>
                <div className="row gap">
                    <button className="btn" disabled={busy} onClick={() => doAction("prev")} title="Piste précédente">⏮</button>
                    <button className="btn" disabled={busy} onClick={() => doAction(isPlaying ? "pause" : "play")} title={isPlaying ? "Pause" : "Lecture"}>
                        {isPlaying ? "⏸" : "▶️"}
                    </button>
                    <button className="btn" disabled={busy} onClick={() => doAction("next")} title="Piste suivante">⏭</button>
                </div>
            </div>

            <div className="row">
                <label>Volume</label>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={vol}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    disabled={busy}
                    style={{ flex: 1 }}
                />
                <span className="mono">{vol}%</span>
            </div>
        </div>
    );
}
