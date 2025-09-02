import { create } from 'zustand';
import { api } from '../api/client';

export type DeviceListItem = {
    id: string;
    name: string;
    createdAt: string;
    disabled: boolean;
    online?: boolean | null;
    lastSeenAt?: string | null;
};

interface DevicesState {
    items: DeviceListItem[];
    loading: boolean;
    error?: string | null;
    fetchDevices: () => Promise<void>;
}

export const useDevices = create<DevicesState>((set) => ({
    items: [],
    loading: false,
    error: null,

    fetchDevices: async () => {
        set({ loading: true, error: null });
        try {
            const { data } = await api.get<DeviceListItem[]>('/devices');
            set({ items: data, loading: false });
        } catch {
            set({ error: 'Impossible de charger les appareils.', loading: false });
        }
    },
}));
