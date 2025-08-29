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

    // LEDs
    ledsToggle: (deviceId: string, on: boolean) => Promise<void>;
    ledsStyle: (deviceId: string, patch: Partial<Pick<LedState, 'color' | 'brightness' | 'preset'>>) => Promise<void>;
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

    // ─── LEDs: toggle on/off (optimiste + rollback)
    ledsToggle: async (deviceId, on) => {
        const state = get();
        const prev = state.byId[deviceId]?.data;
        if (!prev) return;

        // optimistic
        const optimistic: DeviceSnapshot = { ...prev, leds: { ...prev.leds, on } };
        set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: optimistic } } });

        try {
            await api.post(`/devices/${deviceId}/leds/state`, { on });
            // ok, rien à faire (on garde optimiste)
        } catch {
            // rollback
            set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: prev } } });
            throw new Error('LED_TOGGLE_FAILED');
        }
    },

    // ─── LEDs: style (color/brightness/preset) (optimiste + rollback)
    ledsStyle: async (deviceId, patch) => {
        const state = get();
        const prev = state.byId[deviceId]?.data;
        if (!prev) return;

        const nextLed: LedState = {
            ...prev.leds,
            color: patch.color ?? prev.leds.color,
            brightness: patch.brightness ?? prev.leds.brightness,
            preset: patch.preset ?? prev.leds.preset ?? null,
        };
        const optimistic: DeviceSnapshot = { ...prev, leds: nextLed };
        set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: optimistic } } });

        try {
            await api.post(`/devices/${deviceId}/leds/style`, patch);
        } catch {
            // rollback si échec
            set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: prev } } });
            throw new Error('LED_STYLE_FAILED');
        }
    },
}));
