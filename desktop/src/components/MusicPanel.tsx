import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useUI } from '../store/ui';
import { joinDeviceRoom } from '../socket';

export default function MusicPanel(){
    const deviceId = useUI(s=>s.deviceId);
    const music = useUI(s=>s.music);
    const [vol, setVol] = useState(music.volume);

    useEffect(()=>{ setVol(music.volume); }, [music]);
    useEffect(()=>{ if (deviceId) joinDeviceRoom(deviceId); }, [deviceId]);

    const cmd = async (c:'play'|'pause'|'next'|'prev')=>{
        if(!deviceId) return;
        await api.post(`/api/v1/devices/${deviceId}/music/cmd`, { cmd:c });
    };
    const setVolume = async ()=>{
        if(!deviceId) return;
        await api.post(`/api/v1/devices/${deviceId}/music/cmd`, { volume: vol });
    };

    return (
        <div style={card}>
            <h3>Musique</h3>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                <button style={btn} onClick={()=>cmd('prev')}>⏮️</button>
                <button style={btn} onClick={()=>cmd('play')}>▶️</button>
                <button style={btn} onClick={()=>cmd('pause')}>⏸️</button>
                <button style={btn} onClick={()=>cmd('next')}>⏭️</button>
            </div>
            <div style={{marginTop:8}}>
                <input type="range" min={0} max={100} value={vol} onChange={e=>setVol(parseInt(e.target.value))} onMouseUp={setVolume} onTouchEnd={setVolume}/>
                <span style={{marginLeft:8}}>{vol}%</span>
            </div>
        </div>
    );
}
const card = { background:'rgba(255,255,255,0.06)', padding:16, borderRadius:16 } as const;
const btn  = { padding:'8px 12px', borderRadius:12, border:0, background:'#374151', color:'#fff', cursor:'pointer' } as const;
