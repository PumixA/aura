import { useState } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { useAuth } from './store/auth';

export default function App(){
    const user = useAuth(s=>s.user);
    const [route, setRoute] = useState(user ? 'dash' : 'login');
    if (route==='login') return <Login onSuccess={()=>setRoute('dash')} />;
    return <Dashboard />;
}
