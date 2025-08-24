import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useUI } from '../store/ui';

export default function DevicePicker(){
    const [list, setList] = useState<{id:string;name:string}[]>([]);
    const deviceId = useUI(s=>s.deviceId);
    const setDevice = useUI(s=>s.setDevice);

    useEffect(()=>{
        api.get('/api/v1/devices').then(r=>setList(r.data));
    },[]);

    return (
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <span>Device:</span>
            <select value={deviceId ?? ''} onChange={e=>setDevice(e.target.value)} style={{padding:6,borderRadius:8}}>
                <option value="" disabled>Choisir…</option>
                {list.map(d=> <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
        </div>
    );
}
