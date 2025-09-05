import axios from "axios";

const {
    VITE_API_URL,
    VITE_DEVICE_ID,
    VITE_API_KEY,
} = import.meta.env;

if (!VITE_API_URL || !VITE_DEVICE_ID || !VITE_API_KEY) {
    console.error("Config manquante: VITE_API_URL / VITE_DEVICE_ID / VITE_API_KEY");
}

export const API_BASE = `${VITE_API_URL}/api/v1`;
export const DEVICE_ID = String(VITE_DEVICE_ID);
const API_KEY = String(VITE_API_KEY);

export const api = axios.create({
    baseURL: API_BASE,
    timeout: 5000,
    headers: {
        "Authorization": `ApiKey ${API_KEY}`,
        "x-device-id": DEVICE_ID,
        "Content-Type": "application/json",
    },
});

api.interceptors.response.use(
    (res) => res,
    (err) => {
        console.error("API error:", err?.response?.status, err?.response?.data || err.message);
        return Promise.reject(err);
    }
);
