import { useEffect } from 'react';
import DevicePicker from '../components/DevicePicker';
import LedPanel from '../components/LedPanel';
import MusicPanel from '../components/MusicPanel';
import { ensureSocket } from '../socket';
import { useAuth } from '../store/auth';
import { useUI } from '../store/ui';

export default function Dashboard(){
    const user = useAuth(s=>s.user);
    const lastAck = useUI(s=>s.lastAck);

    useEffect(()=>{ ensureSocket(); },[]);

    return (
        <div style={{height:'100vh', background:'#000', color:'#fff', display:'grid', gridTemplateColumns:'2fr 1fr'}}>
            <div style={{padding:32}}>
                <h1 style={{fontSize:42, marginBottom:6}}>Aura Mirror</h1>
                <p style={{opacity:.8, marginBottom:16}}>Bienvenue {user?.email}</p>
                <DevicePicker />
                <div style={{display:'grid', gap:16, gridTemplateColumns:'1fr 1fr', marginTop:16}}>
                    <LedPanel />
                    <MusicPanel />
                </div>
            </div>
            <div style={{padding:32, background:'rgba(255,255,255,0.06)', backdropFilter:'blur(10px)'}}>
                <h3>État</h3>
                <div style={{opacity:.85, marginTop:8}}>Dernier ACK: {lastAck ?? '—'}</div>
                <button style={{marginTop:16}} onClick={()=> (window as any).aura?.quit?.()}>Quitter</button>
            </div>
        </div>
    );
}
