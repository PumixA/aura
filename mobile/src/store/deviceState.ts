// src/store/deviceState.ts
import { create } from 'zustand';
import { api } from '../api/client';

export type LedState = {
    on: boolean;
    color: string;           // "#RRGGBB"
    brightness: number;      // 0..100
    preset?: string | null;
};

export type MusicState = {
    status: 'play' | 'pause';
    volume: number;          // 0..100
    track?: any | null;
};

export type WidgetItem = {
    key: 'clock' | 'weather' | 'music' | 'leds';
    enabled: boolean;
    orderIndex: number;
    config?: any;
};

export type DeviceSnapshot = {
    leds: LedState;
    music: MusicState;
    widgets: WidgetItem[];
};

type PerDevice = {
    data?: DeviceSnapshot;
    loading: boolean;
    error?: string | null;
};

interface DeviceStateStore {
    byId: Record<string, PerDevice>;
    fetchSnapshot: (deviceId: string) => Promise<void>;
    renameDevice: (deviceId: string, name: string) => Promise<{ id: string; name: string }>;
    deleteDevice: (deviceId: string) => Promise<void>;
}

export const useDeviceState = create<DeviceStateStore>((set, get) => ({
    byId: {},

    fetchSnapshot: async (deviceId: string) => {
        const cur = get().byId[deviceId] ?? { loading: false };
        set({ byId: { ...get().byId, [deviceId]: { ...cur, loading: true, error: null } } });
        try {
            const { data } = await api.get<DeviceSnapshot>(`/devices/${deviceId}/state`);
            set({ byId: { ...get().byId, [deviceId]: { data, loading: false, error: null } } });
        } catch (e: any) {
            set({ byId: { ...get().byId, [deviceId]: { ...cur, loading: false, error: 'Impossible de charger le snapshot.' } } });
        }
    },

    renameDevice: async (deviceId, name) => {
        const { data } = await api.put<{ device: { id: string; name: string } }>(`/devices/${deviceId}`, { name });
        return data.device;
    },

    deleteDevice: async (deviceId) => {
        await api.delete(`/devices/${deviceId}`);
    },
}));
