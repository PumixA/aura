import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useUI } from '../store/ui';
import { joinDeviceRoom } from '../socket';

export default function LedPanel(){
    const deviceId = useUI(s=>s.deviceId);
    const leds = useUI(s=>s.leds);
    const [on, setOn] = useState(leds.on);
    const [color, setColor] = useState(leds.color);
    const [brightness, setBrightness] = useState(leds.brightness);

    useEffect(()=>{ setOn(leds.on); setColor(leds.color); setBrightness(leds.brightness); }, [leds]);
    useEffect(()=>{ if (deviceId) joinDeviceRoom(deviceId); }, [deviceId]);

    const send = async () => {
        if (!deviceId) return;
        await api.post(`/api/v1/devices/${deviceId}/leds/state`, { on, color, brightness });
    };

    return (
        <div style={card}>
            <h3>LEDs</h3>
            <label><input type="checkbox" checked={on} onChange={e=>setOn(e.target.checked)}/> ON</label>
            <div style={{marginTop:8}}>
                <input type="color" value={color} onChange={e=>setColor(e.target.value)} />
                <input type="range" min={0} max={100} value={brightness} onChange={e=>setBrightness(parseInt(e.target.value))} />
            </div>
            <button style={btn} onClick={send}>Appliquer</button>
        </div>
    );
}
const card = { background:'rgba(255,255,255,0.06)', padding:16, borderRadius:16 } as const;
const btn  = { marginTop:8, padding:'8px 12px', borderRadius:12, border:0, background:'#2563eb', color:'#fff', cursor:'pointer' } as const;
