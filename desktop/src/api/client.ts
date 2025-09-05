import axios from 'axios';

/**
 * On lit la config directement depuis Vite (fichier .env).
 * Ça évite toute dépendance à window.electron / preload pour la config.
 */
const API_URL = import.meta.env.VITE_API_URL as string;         // ex: "http://192.168.1.96:3000"
const DEVICE_ID = import.meta.env.VITE_DEVICE_ID as string;
const API_KEY = import.meta.env.VITE_API_KEY as string;

if (!API_URL || !DEVICE_ID || !API_KEY) {
    console.error('Config manquante: VITE_API_URL / VITE_DEVICE_ID / VITE_API_KEY');
}

export const http = axios.create({
    baseURL: `${API_URL}/api/v1`,
    headers: {
        'Authorization': `ApiKey ${API_KEY}`,
        'x-device-id': DEVICE_ID,
        'Content-Type': 'application/json',
    },
});

// Helpers de l’API
export async function getDeviceState() {
    const { data } = await http.get(`/devices/${DEVICE_ID}/state`);
    return data;
}

export async function setLedsState(on: boolean) {
    return http.post(`/devices/${DEVICE_ID}/leds/state`, { on });
}

export async function setLedsStyle(style: { color?: string; brightness?: number; preset?: string | null }) {
    return http.post(`/devices/${DEVICE_ID}/leds/style`, style);
}

export async function musicCmd(action: 'play'|'pause'|'next'|'prev') {
    return http.post(`/devices/${DEVICE_ID}/music/cmd`, { action });
}

export async function musicVolume(volume: number) {
    return http.post(`/devices/${DEVICE_ID}/music/volume`, { volume });
}
