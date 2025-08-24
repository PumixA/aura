import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { api } from '../api/client'

type User = { id: string; email: string; firstName?: string; lastName?: string }
type AuthState = {
    user: User | null
    loading: boolean
    login: (email: string, password: string) => Promise<void>
    register: (p: { email: string; password: string; firstName?: string; lastName?: string }) => Promise<void>
    logout: () => Promise<void>
    hydrate: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
    user: null,
    loading: false,
    hydrate: async () => {
        set({ loading: true })
        try {
            const { data } = await api.get('/me')
            set({ user: data })
        } catch {
            set({ user: null })
        } finally {
            set({ loading: false })
        }
    },
    login: async (email, password) => {
        set({ loading: true })
        try {
            const { data } = await api.post('/auth/login', { email, password })
            await SecureStore.setItemAsync('access_token', data.accessToken)
            await SecureStore.setItemAsync('refresh_token', data.refreshToken ?? '')
            const me = await api.get('/me')
            set({ user: me.data })
        } finally {
            set({ loading: false })
        }
    },
    register: async (payload) => {
        set({ loading: true })
        try {
            await api.post('/auth/register', payload)
        } finally {
            set({ loading: false })
        }
    },
    logout: async () => {
        try {
            await api.post('/auth/logout')
        } catch {}
        await SecureStore.deleteItemAsync('access_token')
        await SecureStore.deleteItemAsync('refresh_token')
        set({ user: null })
    },
}))
