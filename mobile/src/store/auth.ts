// src/store/auth.ts
import { create } from 'zustand';
import { api } from '../api/client';
import { saveTokens, clearTokens, loadTokens } from '../lib/token';

export type User = {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
};
export type UserPrefs = {
    theme?: 'light' | 'dark';
    unitSystem?: 'metric' | 'imperial';
    locale?: string | null;
};

interface AuthState {
    user: User | null;
    prefs: UserPrefs | null;
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
    logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
    user: null,
    prefs: null,
    loading: false,
    initialized: false,

    init: async () => {
        set({ loading: true });
        await loadTokens();
        try {
            await useAuth.getState().fetchMe();
        } catch {
            // ignore
        } finally {
            set({ loading: false, initialized: true });
        }
    },

    login: async (email, password) => {
        set({ loading: true });
        try {
            const { data } = await api.post('/auth/login', { email, password });
            const { tokens, user } = data;
            await saveTokens(tokens);
            set({ user });
            await useAuth.getState().fetchMe();
        } finally {
            set({ loading: false });
        }
    },

    register: async (payload) => {
        set({ loading: true });
        try {
            const { data } = await api.post('/auth/register', payload);
            const { tokens, user } = data;
            await saveTokens(tokens);
            set({ user });
            await useAuth.getState().fetchMe();
        } finally {
            set({ loading: false });
        }
    },

    fetchMe: async () => {
        const { data } = await api.get('/me');
        set({ user: data.user, prefs: data.prefs });
    },

    logout: async () => {
        try {
            const tokens = await loadTokens();
            if (tokens?.refreshToken) {
                await api.post('/auth/logout', { refreshToken: tokens.refreshToken }).catch(() => {});
            }
        } finally {
            await clearTokens();
            set({ user: null, prefs: null });
        }
    },
}));
