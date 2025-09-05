import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGetState, apiLedsState, apiLedsStyle, apiMusicCmd, apiMusicVolume, cfg } from '../api/client';
import type { DeviceSnapshot } from '../types';
import '../index.css';

type Tab = 'music' | 'light';

export default function Home() {
    const [tab, setTab] = useState<Tab>('music');
    const [snap, setSnap] = useState<DeviceSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const pollRef = useRef<number | null>(null);

    useEffect(() => {
        let mounted = true;
        async function pull() {
            try {
                const s = await apiGetState();
                if (mounted) {
                    setSnap(s);
                    setLoading(false);
                }
            } catch (e) {
                console.error('poll /state failed:', e);
            }
        }
        pull();
        const every = Math.max(0.5, Number(cfg.music_poll_sec || 1));
        pollRef.current = window.setInterval(pull, every * 1000);
        return () => { mounted = false; if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    const volume = snap?.music?.volume ?? 0;
    const playing = snap?.music?.status === 'play';
    const ledsOn = snap?.leds?.on ?? false;
    const brightness = snap?.leds?.brightness ?? 0;
    const color = snap?.leds?.color ?? '#FFFFFF';

    function nextTab() { setTab(prev => prev === 'music' ? 'light' : 'music'); }
    function prevTab() { setTab(prev => prev === 'music' ? 'light' : 'music'); }

    async function handleVolume(v: number) {
        await apiMusicVolume(Math.max(0, Math.min(100, Math.round(v))));
    }
    async function handleMusic(action: 'play'|'pause'|'next'|'prev') {
        await apiMusicCmd(action);
    }
    async function handleLedsOnOff(on: boolean) {
        await apiLedsState(on);
    }
    async function handleBrightness(b: number) {
        await apiLedsStyle({ brightness: Math.max(0, Math.min(100, Math.round(b))) });
    }
    async function handleColor(hex: string) {
        await apiLedsStyle({ color: hex.toUpperCase() });
    }

    const title = useMemo(() => tab === 'music' ? 'Musique' : 'Lumière', [tab]);

    return (
        <div className="center" style={{ height: '100%', width: '100%', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 20, right: 20 }}>
                <div className="icon-btn" title="Paramètres">⚙️</div>
            </div>

            <div className="col" style={{ alignItems: 'center', gap: 36 }}>
                {/* nav modules */}
                <div className="row" style={{ gap: 40 }}>
                    <div className="arrow" onClick={prevTab}>‹</div>
                    <div className="circle" style={{ fontSize: 28 }}>
                        {tab === 'music' ? '🎵' : '💡'}
                    </div>
                    <div className="arrow" onClick={nextTab}>›</div>
                </div>

                {loading && <div className="value" style={{ color: 'var(--muted)' }}>Chargement…</div>}

                {!loading && tab === 'music' && (
                    <>
                        <div className="slider-wrap">
                            <input
                                className="slider"
                                type="range"
                                min={0}
                                max={100}
                                value={volume}
                                onChange={(e) => handleVolume(Number(e.currentTarget.value))}
                            />
                        </div>
                        <div className="value">{volume}</div>

                        <div className="row" style={{ gap: 18 }}>
                            <div className="icon-btn" title="Précédent" onClick={() => handleMusic('prev')}>⏮️</div>
                            <div className="icon-btn" title={playing ? 'Pause' : 'Lire'} onClick={() => handleMusic(playing ? 'pause' : 'play')}>
                                {playing ? '⏸️' : '▶️'}
                            </div>
                            <div className="icon-btn" title="Suivant" onClick={() => handleMusic('next')}>⏭️</div>
                        </div>
                    </>
                )}

                {!loading && tab === 'light' && (
                    <>
                        <div className="toggle-wrap">
                            <div className={`toggle ${ledsOn ? 'on' : ''}`} onClick={() => handleLedsOnOff(!ledsOn)}>
                                <div className="knob" />
                            </div>
                        </div>
                        <div className="value">{ledsOn ? 'Activé' : 'Éteint'}</div>

                        <div className="slider-wrap">
                            <input
                                className="slider"
                                type="range"
                                min={0}
                                max={100}
                                value={brightness}
                                onChange={(e) => handleBrightness(Number(e.currentTarget.value))}
                                disabled={!ledsOn}
                            />
                        </div>
                        <div className="value">{brightness}</div>

                        <div className="palette">
                            {['#FFFFFF','#00FF88','#FF0066','#00AAFF','#FFD400'].map((c) => (
                                <div key={c} className="swatch" style={{ background: c }} onClick={() => handleColor(c)} title={c} />
                            ))}
                        </div>
                        <div style={{ color: 'var(--muted)' }}>Couleur actuelle : {color?.toUpperCase?.()}</div>
                    </>
                )}
            </div>

            <div style={{ position: 'absolute', bottom: 26, left: 0, right: 0, textAlign: 'center', color: 'var(--muted)', letterSpacing: 2 }}>
                {title}
            </div>
        </div>
    );
}
