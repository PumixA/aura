import { create } from 'zustand';
import { api } from '../api/client';
import { createDeviceSocket, DeviceSocket } from '../api/socket';
import { useAuth } from '../store/auth';

export type LedState = {
    on: boolean;
    color: string;
    brightness: number;
    preset?: string | null;
};

export type MusicState = {
    status: 'play' | 'pause';
    volume: number;
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

    weather?:
        | {
        city: string;
        units: 'metric' | 'imperial';
        temp: number;
        desc: string;
        icon: string;
        updatedAt: string;
        ttlSec: number;
    }
        | null;
    weatherLoading?: boolean;
    weatherError?: string | null;

    wsStatus?: 'disconnected' | 'connecting' | 'connected';
    wsError?: string | null;
    agentOnline?: boolean;

    _socket?: DeviceSocket | null;
    _onlineTimer?: ReturnType<typeof setTimeout> | null;
};

interface DeviceStateStore {
    byId: Record<string, PerDevice>;

    fetchSnapshot: (deviceId: string) => Promise<void>;
    renameDevice: (deviceId: string, name: string) => Promise<{ id: string; name: string }>;
    deleteDevice: (deviceId: string) => Promise<void>; // ← “Dissocier” (POST /unpair)

    ledsToggle: (deviceId: string, on: boolean) => Promise<void>;
    ledsStyle: (deviceId: string, patch: Partial<Pick<LedState, 'color' | 'brightness' | 'preset'>>) => Promise<void>;

    musicCmd: (deviceId: string, action: 'play' | 'pause' | 'next' | 'prev') => Promise<void>;
    musicSetVolume: (deviceId: string, value: number) => Promise<void>;

    widgetsPut: (deviceId: string, items: WidgetItem[]) => Promise<WidgetItem[]>;

    fetchWeather: (city: string, units?: 'metric' | 'imperial', deviceIdForCache?: string) => Promise<void>;

    openSocket: (deviceId: string) => void;
    closeSocket: (deviceId: string) => void;
}

const ONLINE_TTL_MS = 15_000;

function armOnlineTimer(
    deviceId: string,
    get: () => DeviceStateStore,
    setPartial: (p: Partial<DeviceStateStore>) => void
) {
    const st = get();
    const per = st.byId[deviceId] ?? ({ loading: false } as PerDevice);

    if (per._onlineTimer) {
        try {
            clearTimeout(per._onlineTimer);
        } catch {}
    }
    const t = setTimeout(() => {
        const cur = get().byId[deviceId];
        if (!cur) return;
        setPartial({
            byId: {
                ...get().byId,
                [deviceId]: { ...cur, agentOnline: false, _onlineTimer: null },
            },
        });
    }, ONLINE_TTL_MS);

    setPartial({
        byId: {
            ...st.byId,
            [deviceId]: { ...per, agentOnline: true, _onlineTimer: t },
        },
    });
}

export const useDeviceState = create<DeviceStateStore>((set, get) => ({
    byId: {},

    fetchSnapshot: async (deviceId: string) => {
        const cur = (get().byId[deviceId] ?? { loading: false }) as PerDevice;
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
                        agentOnline: get().byId[deviceId]?.agentOnline ?? false,
                        _onlineTimer: get().byId[deviceId]?._onlineTimer ?? null,
                    },
                },
            });

            try {
                const { data: live } = await api.get<{ online: boolean; lastSeenAt: string | null }>(
                    `/devices/${deviceId}/online`
                );
                const current = get().byId[deviceId];
                if (current) {
                    set({
                        byId: {
                            ...get().byId,
                            [deviceId]: { ...current, agentOnline: !!live?.online },
                        },
                    });
                }
            } catch {}
        } catch {
            set({
                byId: {
                    ...get().byId,
                    [deviceId]: { ...cur, loading: false, error: 'Impossible de charger le snapshot.' },
                },
            });
        }
    },

    renameDevice: async (deviceId, name) => {
        const { data } = await api.put<{ device: { id: string; name: string } }>(`/devices/${deviceId}`, { name });
        return data.device;
    },

    // ⬇️ CHANGÉ : on appelle l’unpair (POST) au lieu de DELETE /devices/:id
    deleteDevice: async (deviceId) => {
        const st = get();
        const per = st.byId[deviceId];

        // fermer proprement
        if (per?._socket) {
            try {
                per._socket.disconnect();
            } catch {}
        }
        if (per?._onlineTimer) {
            try {
                clearTimeout(per._onlineTimer);
            } catch {}
        }

        // Appel backend: dissocier (unpair)
        await api.post(`/devices/${deviceId}/unpair`);

        // Nettoyage store (on retire l’entrée locale)
        const copy = { ...st.byId };
        delete copy[deviceId];
        set({ byId: copy });
    },

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

    widgetsPut: async (deviceId, items) => {
        const state = get();
        const prev = state.byId[deviceId]?.data;
        if (!prev) throw new Error('NO_SNAPSHOT');

        const optimistic: DeviceSnapshot = { ...prev, widgets: items.slice().sort((a, b) => a.orderIndex - b.orderIndex) };
        set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: optimistic } } });

        try {
            const { data } = await api.put<{ items: WidgetItem[] }>(`/devices/${deviceId}/widgets`, { items });
            const normalized = data.items.slice().sort((a, b) => a.orderIndex - b.orderIndex);
            set({
                byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: { ...prev, widgets: normalized } } },
            });
            return normalized;
        } catch {
            set({ byId: { ...state.byId, [deviceId]: { ...state.byId[deviceId], data: prev } } });
            throw new Error('WIDGETS_PUT_FAILED');
        }
    },

    fetchWeather: async (city, units = 'metric', deviceIdForCache) => {
        const key = deviceIdForCache ?? '__global__';
        const cur = (get().byId[key] ?? { loading: false }) as PerDevice;
        set({ byId: { ...get().byId, [key]: { ...cur, weatherLoading: true, weatherError: null } } });
        try {
            const { data } = await api.get(`/weather`, { params: { city, units } });
            set({ byId: { ...get().byId, [key]: { ...get().byId[key], weather: data, weatherLoading: false } } });
        } catch {
            set({
                byId: {
                    ...get().byId,
                    [key]: { ...get().byId[key], weatherLoading: false, weatherError: 'Météo indisponible.' },
                },
            });
        }
    },

    openSocket: (deviceId) => {
        const st = get();
        const per = (st.byId[deviceId] ?? { loading: false }) as PerDevice;
        if (per._socket) return; // déjà ouvert

        const token = useAuth.getState().accessToken;
        if (!token) {
            set({
                byId: {
                    ...st.byId,
                    [deviceId]: { ...per, wsStatus: 'disconnected', wsError: 'NO_TOKEN', agentOnline: false },
                },
            });
            return;
        }

        const sock = createDeviceSocket(token);
        set({
            byId: {
                ...st.byId,
                [deviceId]: {
                    ...per,
                    _socket: sock,
                    wsStatus: 'connecting',
                    wsError: null,
                    agentOnline: per.agentOnline ?? false,
                    _onlineTimer: per._onlineTimer ?? null,
                },
            },
        });

        sock.on('connect', () => {
            sock.emit('ui:join', { deviceId });
            set({
                byId: {
                    ...get().byId,
                    [deviceId]: { ...get().byId[deviceId], wsStatus: 'connected', wsError: null },
                },
            });
        });

        sock.on('connect_error', (err: any) => {
            set({
                byId: {
                    ...get().byId,
                    [deviceId]: {
                        ...get().byId[deviceId],
                        wsStatus: 'disconnected',
                        wsError: String(err?.message || err),
                        agentOnline: false,
                    },
                },
            });
        });

        sock.on('disconnect', () => {
            const cur = get().byId[deviceId];
            if (cur?._onlineTimer) {
                try {
                    clearTimeout(cur._onlineTimer);
                } catch {}
            }
            set({
                byId: {
                    ...get().byId,
                    [deviceId]: {
                        ...get().byId[deviceId],
                        wsStatus: 'disconnected',
                        agentOnline: false,
                        _onlineTimer: null,
                    },
                },
            });
        });

        sock.on('state:update', (payload: any) => {
            const raw = payload?.state ?? payload ?? {};
            const cur = get().byId[deviceId]?.data;

            const base: DeviceSnapshot =
                cur ?? {
                    leds: { on: false, color: '#FFFFFF', brightness: 50, preset: null },
                    music: { status: 'pause', volume: 50, track: null },
                    widgets: [],
                };

            const next: DeviceSnapshot = {
                leds: raw.leds ? { ...base.leds, ...raw.leds } : base.leds,
                music: raw.music ? { ...base.music, ...raw.music } : base.music,
                widgets: raw.widgets ? raw.widgets.slice().sort((a: any, b: any) => a.orderIndex - b.orderIndex) : base.widgets,
            };

            set({
                byId: {
                    ...get().byId,
                    [deviceId]: { ...get().byId[deviceId], data: next },
                },
            });

            armOnlineTimer(deviceId, get, (p) => set(p as any));
        });

        sock.on('agent:ack', () => armOnlineTimer(deviceId, get, (p) => set(p as any)));
        sock.on('agent:heartbeat', () => armOnlineTimer(deviceId, get, (p) => set(p as any)));
        sock.on('presence', (msg: any) => {
            if (!msg || msg.deviceId !== deviceId) return;
            if (msg.online) {
                armOnlineTimer(deviceId, get, (p) => set(p as any));
            } else {
                const cur = get().byId[deviceId];
                if (cur?._onlineTimer) {
                    try {
                        clearTimeout(cur._onlineTimer);
                    } catch {}
                }
                set({
                    byId: {
                        ...get().byId,
                        [deviceId]: { ...get().byId[deviceId], agentOnline: false, _onlineTimer: null },
                    },
                });
            }
        });
    },

    closeSocket: (deviceId) => {
        const st = get();
        const per = st.byId[deviceId];
        if (per?._socket) {
            try {
                per._socket.disconnect();
            } catch {}
        }
        if (per?._onlineTimer) {
            try {
                clearTimeout(per._onlineTimer);
            } catch {}
        }
        set({
            byId: {
                ...st.byId,
                [deviceId]: { ...per, _socket: null, wsStatus: 'disconnected', agentOnline: false, _onlineTimer: null },
            },
        });
    },
}));
