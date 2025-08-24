import axios from 'axios';

const API_URL = (window as any).aura?.env?.API_URL || import.meta.env.VITE_API_URL;

export const api = axios.create({ baseURL: API_URL, timeout: 10000 });

let accessToken: string | null = null;
export const setToken = (t: string | null) => { accessToken = t; };
export const getToken = () => accessToken;

api.interceptors.request.use((cfg) => {
    if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
    return cfg;
});
