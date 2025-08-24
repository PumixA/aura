import { useState } from 'react';
import { useAuth } from '../store/auth';

export default function Login({ onSuccess }:{ onSuccess:()=>void }){
    const login = useAuth(s=>s.login);
    const [email, setEmail] = useState('admin@aura.local');
    const [password, setPassword] = useState('Passw0rd!');
    const [err, setErr] = useState<string>();

    return (
        <div style={wrap}>
            <div style={card}>
                <h1>Connexion</h1>
                <input style={input} value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/>
                <input style={input} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mot de passe" type="password"/>
                <button style={btn} onClick={async()=>{
                    try { setErr(undefined); await login(email,password); onSuccess(); }
                    catch(e:any){ setErr(e?.response?.data?.message || 'Erreur de connexion'); }
                }}>Se connecter</button>
                {err && <p style={{color:'#fca5a5'}}>{err}</p>}
            </div>
        </div>
    );
}
const wrap={display:'grid',placeItems:'center',height:'100vh',background:'#0b0f14',color:'#fff'};
const card={width:360, background:'rgba(255,255,255,0.04)', padding:24, borderRadius:16};
const input={width:'100%', padding:12, margin:'6px 0', borderRadius:12, border:'1px solid #1f2937', background:'#111827', color:'#fff'};
const btn={width:'100%', padding:12, marginTop:8, borderRadius:12, border:0, background:'#2563eb', color:'#fff', fontWeight:600, cursor:'pointer'};
