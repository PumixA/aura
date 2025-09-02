import { create } from 'zustand';
import { api } from '../api/client';
import {
    loadTokens,
    saveTokens,
    clearTokens,
    getAccessTokenSync,
} from '../lib/token';
import { registerAccessTokenListener } from '../api/authBridge';


export type User = {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
};

interface AuthState {
    user: User | null;
    accessToken: string | null;

    loading: boolean;
    initialized: boolean;

    init: () => Promise<void>;
    login: (email: string, password: string) => Promise<void>;
    register: (payload: {
        email: string;
        password: string;
        firstName?: string;
        lastName?: string;
    }) => Promise<void>;
    fetchMe: () => Promise<void>;
    updateMe: (payload: { firstName?: string; lastName?: string }) => Promise<void>;
    logout: () => Promise<void>;
}


export const useAuth = create<AuthState>((set, get) => ({
    user: null,
    accessToken: null,

    loading: false,
    initialized: false,

    init: async () => {
        set({ loading: true });
        try {
            await loadTokens();
            const at = getAccessTokenSync();
            if (at) set({ accessToken: at });
            try {
                await get().fetchMe();
            } catch {
            }
        } finally {
            set({ loading: false, initialized: true });
        }
    },

    login: async (email, password) => {
        set({ loading: true });
        try {
            const { data } = await api.post('/auth/login', { email, password });
            const { tokens, user } = data || {};
            if (tokens?.accessToken && tokens?.refreshToken) {
                await saveTokens(tokens);
                set({ accessToken: tokens.accessToken, user: user ?? null });
            }
            await get().fetchMe().catch(() => {});
        } finally {
            set({ loading: false });
        }
    },

    register: async (payload) => {
        set({ loading: true });
        try {
            const { data } = await api.post('/auth/register', payload);
            const { tokens, user } = data || {};
            if (tokens?.accessToken && tokens?.refreshToken) {
                await saveTokens(tokens);
                set({ accessToken: tokens.accessToken, user: user ?? null });
            }
            await get().fetchMe().catch(() => {});
        } finally {
            set({ loading: false });
        }
    },

    fetchMe: async () => {
        const { data } = await api.get('/me');
        set({ user: data?.user ?? null });
    },

    updateMe: async (payload) => {
        set({ loading: true });
        try {
            const { data } = await api.put('/me', payload);
            set({ user: data?.user ?? null });
        } finally {
            set({ loading: false });
        }
    },

    logout: async () => {
        try {
            const tokens = await loadTokens();
            const rt = tokens?.refreshToken;
            if (rt) {
                await api.post('/auth/logout', { refreshToken: rt }).catch(() => {});
            }
        } finally {
            await clearTokens();
            set({ user: null, accessToken: null });
        }
    },
}));

registerAccessTokenListener((token) => {
    useAuth.setState({ accessToken: token });
});
