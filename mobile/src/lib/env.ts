// src/lib/env.ts
export type AuraEnv = 'development' | 'production' | 'test';

const get = (key: string, fallback?: string) => {
    const v = process.env[key] ?? (global as any).process?.env?.[key];
    if (v == null) return fallback;
    return String(v);
};

const normalizeUrl = (url?: string | null) => {
    if (!url) return '';
    return url.replace(/\/$/, '');
};

export const ENV: AuraEnv = (get('EXPO_PUBLIC_ENV', 'development') as AuraEnv);
export const API_URL = normalizeUrl(get('EXPO_PUBLIC_API_URL', 'http://127.0.0.1:3000'));
export const WEB_URL = normalizeUrl(get('EXPO_PUBLIC_WEB_URL', 'http://127.0.0.1:3000'));

export const API_BASE = `${API_URL}/api/v1`;

if (!API_URL) {
    console.warn('[env] EXPO_PUBLIC_API_URL manquant. Utilisation de http://127.0.0.1:3000');
}
