import { create } from 'zustand'
import { api } from '../api/client'

export type Device = { id: string; name: string; createdAt: string }

type DevicesState = {
    items: Device[]
    loading: boolean
    fetch: () => Promise<void>
}

export const useDevices = create<DevicesState>((set) => ({
    items: [],
    loading: false,
    fetch: async () => {
        set({ loading: true })
        try {
            const { data } = await api.get('/devices')
            set({ items: data })
        } finally {
            set({ loading: false })
        }
    },
}))
