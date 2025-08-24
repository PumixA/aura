import { create } from 'zustand';
import { api, setToken } from '../api/client';

type User = { id?:string; email:string; firstName?:string; lastName?:string };
type Auth = {
    user: User | null;
    login: (email:string, password:string) => Promise<void>;
    logout: () => void;
};

export const useAuth = create<Auth>((set) => ({
    user: null,
    async login(email, password) {
        const { data } = await api.post('/api/v1/auth/login', { email, password });
        setToken(data.accessToken);
        // si tu as /api/v1/me, utilise-le ; sinon on set minimal
        let me: User = { email };
        try { me = (await api.get('/api/v1/me')).data; } catch {}
        set({ user: me });
    },
    logout() { setToken(null); set({ user: null }); }
}));
