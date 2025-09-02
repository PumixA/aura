// src/store/auth.ts
import { create } from 'zustand';
import { api } from '../api/client';
import {
    loadTokens,
    saveTokens,
    clearTokens,
    getAccessTokenSync,
} from '../lib/token';
import { registerAccessTokenListener } from '../api/authBridge';

/* ---------- Types ---------- */

export type User = {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
};

interface AuthState {
    // Données
    user: User | null;
    accessToken: string | null;

    // UI/flux
    loading: boolean;
    initialized: boolean;

    // Actions
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

/* ---------- Store ---------- */

export const useAuth = create<AuthState>((set, get) => ({
    user: null,
    accessToken: null,

    loading: false,
    initialized: false,

    /* Boot app: charge tokens → set accessToken → me() */
    init: async () => {
        set({ loading: true });
        try {
            await loadTokens();
            const at = getAccessTokenSync();
            if (at) set({ accessToken: at });
            // Tente de récupérer le profil si token présent/valide
            try {
                await get().fetchMe();
            } catch {
                // silencieux (token expiré, réseau down, etc.)
            }
        } finally {
            set({ loading: false, initialized: true });
        }
    },

    /* POST /auth/login → tokens + me() */
    login: async (email, password) => {
        set({ loading: true });
        try {
            const { data } = await api.post('/auth/login', { email, password });
            const { tokens, user } = data || {};
            if (tokens?.accessToken && tokens?.refreshToken) {
                await saveTokens(tokens);
                set({ accessToken: tokens.accessToken, user: user ?? null });
            }
            // Normalize avec /me (source de vérité)
            await get().fetchMe().catch(() => {});
        } finally {
            set({ loading: false });
        }
    },

    /* POST /auth/register → tokens + me() */
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

    /* GET /me → { user, prefs } (on ignore prefs côté store) */
    fetchMe: async () => {
        const { data } = await api.get('/me');
        set({ user: data?.user ?? null });
    },

    /* PUT /me → { user, prefs } (on set uniquement user) */
    updateMe: async (payload) => {
        set({ loading: true });
        try {
            const { data } = await api.put('/me', payload);
            set({ user: data?.user ?? null });
        } finally {
            set({ loading: false });
        }
    },

    /* POST /auth/logout + purge locale */
    logout: async () => {
        try {
            // on tente un revoke distant mais on ne bloque pas en cas d’erreur
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

/* ---------- Bridge: MAJ accessToken depuis les interceptors axios ---------- */
/* Évite tout import croisé client ↔ store. Le client axios émet les MAJ token via emitAccessToken(). */
registerAccessTokenListener((token) => {
    useAuth.setState({ accessToken: token });
});
