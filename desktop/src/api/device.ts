// src/api/device.ts
import { api, DEVICE_ID } from "./client";

export type LedState = {
    on: boolean;
    color: string;
    brightness: number;
    preset: string | null;
};

export type MusicState = {
    status: "play" | "pause";
    volume: number;
    track: any | null;
};

export type WidgetCfg = {
    key: string;
    enabled: boolean;
    orderIndex: number;
    config: Record<string, any>;
};

export type DeviceSnapshot = {
    leds: LedState;
    music: MusicState;
    widgets: WidgetCfg[];
};

export async function getDeviceState(): Promise<DeviceSnapshot> {
    const { data } = await api.get(`/devices/${DEVICE_ID}/state`);
    return data as DeviceSnapshot;
}

// === LEDs ===
export async function ledsSetPower(on: boolean) {
    await api.post(`/devices/${DEVICE_ID}/leds/state`, { on });
}

export async function ledsSetStyle(patch: Partial<Pick<LedState, "color"|"brightness"|"preset">>) {
    await api.post(`/devices/${DEVICE_ID}/leds/style`, patch);
}

// === Music ===
export async function musicSetVolume(volume: number) {
    // IMPORTANT : l'API attend { value }, pas { volume }
    const value = Math.max(0, Math.min(100, Math.round(volume)));
    await api.post(`/devices/${DEVICE_ID}/music/volume`, { value });
}

export async function musicCmd(action: "play"|"pause"|"next"|"prev") {
    await api.post(`/devices/${DEVICE_ID}/music/cmd`, { action });
}
