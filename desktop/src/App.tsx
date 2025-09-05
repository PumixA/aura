import { useEffect, useState } from 'react';
import { getDeviceState } from './api/client';

export default function App() {
    const [loaded, setLoaded] = useState(false);
    const [state, setState] = useState<any>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const s = await getDeviceState();
                setState(s);
                setLoaded(true);
            } catch (e: any) {
                setErr(e?.message || String(e));
            }
        })();
    }, []);

    return (
        <div style={{
            height: '100vh', width: '100vw',
            display: 'grid', placeItems: 'center',
            background: '#000', color: '#fff',
            fontFamily: 'system-ui, sans-serif'
        }}>
            {!loaded && !err && <div>Chargement…</div>}
            {err && <div style={{color: '#f66'}}>Erreur: {err}</div>}
            {loaded && (
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, marginBottom: 12 }}>Renderer OK ✨</div>
                    <pre style={{ textAlign: 'left', fontSize: 14, background:'#111', padding:12, borderRadius:8, maxWidth:800, maxHeight:400, overflow:'auto' }}>
{JSON.stringify(state, null, 2)}
          </pre>
                </div>
            )}
        </div>
    );
}
