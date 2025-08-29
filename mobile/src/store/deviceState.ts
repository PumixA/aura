// src/store/deviceState.ts
import { create } from 'zustand';
import { api } from '../api/client';
import { createDeviceSocket, DeviceSocket } from '../api/socket';
import { useAuth } from '../store/auth';

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

    // météo (optionnel)
    weather?: {
        city: string;
        units: 'metric' | 'imperial';
        temp: number;
        desc: string;
        icon: string;
        updatedAt: string;
        ttlSec: number;
    } | null;
    weatherLoading?: boolean;
    weatherError?: string | null;

    // realtime
    wsStatus?: 'disconnected' | 'connecting' | 'connected';
    wsError?: string | null;
    _socket?: DeviceSocket | null;
};

interface DeviceStateStore {
    byId: Record<string, PerDevice>;

    fetchSnapshot: (deviceId: string) => Promise<void>;
    renameDevice: (deviceId: string, name: string) => Promise<{ id: string; name: string }>;
    deleteDevice: (deviceId: string) => Promise<void>;

    // LEDs
    ledsToggle: (deviceId: string, on: boolean) => Promise<void>;
    ledsStyle: (deviceId: string, patch: Partial<Pick<LedState, 'color' | 'brightness' | 'preset'>>) => Promise<void>;

    // Music
    musicCmd: (deviceId: string, action: 'play' | 'pause' | 'next' | 'prev') => Promise<void>;
    musicSetVolume: (deviceId: string, value: number) => Promise<void>;

    // Widgets
    widgetsPut: (deviceId: string, items: WidgetItem[]) => Promise<WidgetItem[]>;

    // Weather
    fetchWeather: (city: string, units?: 'metric' | 'imperial', deviceIdForCache?: string) => Promise<void>;

    // Realtime
    openSocket: (deviceId: string) => void;
    closeSocket: (deviceId: string) => void;
}

export const useDeviceState = create<DeviceStateStore>((set, get) => ({
    byId: {},

    // ───────────────── fetch snapshot
    fetchSnapshot: async (deviceId: string) => {
        const cur = get().byId[deviceId] ?? { loading: false };
        set({ byId: { ...get().byId, [deviceId]: { ...cur, loading: true, error: null } } });
        try {
            const { data } = await api.get<DeviceSnapshot>(`/devices/${deviceId}/state`);
            set({
                byId: {
                    ...get().byId,
                    [deviceId]: {
                        ...get().byId[deviceId],
                        data,
                        loading: false,
                        error: null,
                        wsStatus: get().byId[deviceId]?.wsStatus ?? 'disconnected',
                    },
                },
            });
        } catch (e: any) {
            set({ byId: { ...get().byId, [deviceId]: { ...cur, loading: false, error: 'Impossible de charger le snapshot.' } } });
        }
    },

    renameDevice: async (deviceId, name) => {
        const { data } = await api.put<{ device: { id: string; name: string } }>(`/devices/${deviceId}`, { name });
        return data.device;
    },

    deleteDevice: async (deviceId) => {
        // ferme socket avant suppression
        get().closeSocket(deviceId);
        await api.delete(`/devices/${deviceId}`);
        const copy = { ...get().byId };
        delete copy[deviceId];
        set({ byId: copy });
    },

    // ─── LEDs
    ledsToggle: async (deviceId, on) => {
        const state = get();
        const prev = state.byId[deviceId]?.data;
        if (!prev) return;

        const optimistic: DeviceSnapshot = { ...prev, leds: { ...prev.leds, on } };
        set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: optimistic } } });

        try {
            await api.post(`/devices/${deviceId}/leds/state`, { on });
        } catch {
            set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: prev } } });
            throw new Error('LED_TOGGLE_FAILED');
        }
    },

    ledsStyle: async (deviceId, patch) => {
        const state = get();
        const prev = state.byId[deviceId]?.data;
        if (!prev) return;

        const nextLed: LedState = {
            ...prev.leds,
            color: patch.color ?? prev.leds.color,
            brightness: patch.brightness ?? prev.leds.brightness,
            preset: (patch.preset !== undefined ? patch.preset : prev.leds.preset) ?? null,
        };
        const optimistic: DeviceSnapshot = { ...prev, leds: nextLed };
        set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: optimistic } } });

        try {
            await api.post(`/devices/${deviceId}/leds/style`, patch);
        } catch {
            set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: prev } } });
            throw new Error('LED_STYLE_FAILED');
        }
    },

    // ─── Music
    musicCmd: async (deviceId, action) => {
        const state = get();
        const prev = state.byId[deviceId]?.data;
        if (!prev) return;

        let optimistic: DeviceSnapshot | undefined;
        if (action === 'play' || action === 'pause') {
            optimistic = { ...prev, music: { ...prev.music, status: action } };
            set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: optimistic } } });
        }
        try {
            await api.post(`/devices/${deviceId}/music/cmd`, { action });
        } catch {
            if (optimistic) {
                set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: prev } } });
            }
            throw new Error('MUSIC_CMD_FAILED');
        }
    },

    musicSetVolume: async (deviceId, value) => {
        const state = get();
        const prev = state.byId[deviceId]?.data;
        if (!prev) return;

        const v = Math.max(0, Math.min(100, Math.round(value)));
        const optimistic: DeviceSnapshot = { ...prev, music: { ...prev.music, volume: v } };
        set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: optimistic } } });

        try {
            await api.post(`/devices/${deviceId}/music/volume`, { value: v });
        } catch {
            set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: prev } } });
            throw new Error('MUSIC_VOLUME_FAILED');
        }
    },

    // ─── Widgets
    widgetsPut: async (deviceId, items) => {
        const state = get();
        const prev = state.byId[deviceId]?.data;
        if (!prev) throw new Error('NO_SNAPSHOT');

        const optimistic: DeviceSnapshot = { ...prev, widgets: items.slice().sort((a,b)=>a.orderIndex-b.orderIndex) };
        set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: optimistic } } });

        try {
            const { data } = await api.put<{ items: WidgetItem[] }>(`/devices/${deviceId}/widgets`, { items });
            const normalized = data.items.slice().sort((a,b)=>a.orderIndex-b.orderIndex);
            set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: { ...prev, widgets: normalized } } } });
            return normalized;
        } catch {
            set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: prev } } });
            throw new Error('WIDGETS_PUT_FAILED');
        }
    },

    // ─── Weather
    fetchWeather: async (city, units = 'metric', deviceIdForCache) => {
        const key = deviceIdForCache ?? '__global__';
        const cur = get().byId[key] ?? { loading: false };
        set({ byId: { ...get().byId, [key]: { ...cur, weatherLoading: true, weatherError: null } } });
        try {
            const { data } = await api.get(`/weather`, { params: { city, units } });
            set({ byId: { ...get().byId, [key]: { ...get().byId[key], weather: data, weatherLoading: false } } });
        } catch (e) {
            set({ byId: { ...get().byId, [key]: { ...get().byId[key], weatherLoading: false, weatherError: 'Météo indisponible.' } } });
        }
    },

    // ─── Realtime
    openSocket: (deviceId) => {
        const st = get();
        const per = st.byId[deviceId] ?? {};
        if (per._socket) return; // déjà ouvert

        const token = useAuth.getState().accessToken;
        if (!token) {
            set({ byId: { ...st.byId, [deviceId]: { ...per, wsStatus: 'disconnected', wsError: 'NO_TOKEN' } } });
            return;
        }

        const sock = createDeviceSocket(token);

        // états
        set({ byId: { ...st.byId, [deviceId]: { ...per, _socket: sock, wsStatus: 'connecting', wsError: null } } });

        sock.on('connect', () => {
            // rejoindre la room deviceId
            sock.emit('ui:join', { deviceId });
            set({ byId: { ...get().byId, [deviceId]: { ...get().byId[deviceId], wsStatus: 'connected', wsError: null } } });
        });

        sock.on('connect_error', (err: any) => {
            set({ byId: { ...get().byId, [deviceId]: { ...get().byId[deviceId], wsStatus: 'disconnected', wsError: String(err?.message || err) } } });
        });

        sock.on('disconnect', () => {
            set({ byId: { ...get().byId, [deviceId]: { ...get().byId[deviceId], wsStatus: 'disconnected' } } });
        });

        // merge patch: { leds? music? widgets? }
        sock.on('state:update', (payload: any) => {
            const cur = get().byId[deviceId]?.data;
            if (!cur) return;
            const next: DeviceSnapshot = {
                leds: payload.leds ? { ...cur.leds, ...payload.leds } : cur.leds,
                music: payload.music ? { ...cur.music, ...payload.music } : cur.music,
                widgets: payload.widgets ? payload.widgets.slice().sort((a:any,b:any)=>a.orderIndex-b.orderIndex) : cur.widgets,
            };
            set({ byId: { ...get().byId, [deviceId]: { ...get().byId[deviceId], data: next } } });
        });

        // (facultatif) log ack/nack
        sock.on('ack', () => {});
        sock.on('nack', () => {});
    },

    closeSocket: (deviceId) => {
        const st = get();
        const per = st.byId[deviceId];
        if (per?._socket) {
            try { per._socket.disconnect(); } catch {}
        }
        set({ byId: { ...st.byId, [deviceId]: { ...per, _socket: null, wsStatus: 'disconnected' } } });
    },
}));
