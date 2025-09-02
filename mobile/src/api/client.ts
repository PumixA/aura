import axios, { AxiosError } from 'axios';
import { API_BASE } from '../lib/env';
import {
    loadTokens, saveTokens, clearTokens,
    getAccessTokenSync, getRefreshTokenSync, setAccessTokenSync,
} from '../lib/token';
import { emitAccessToken } from './authBridge';

export const api = axios.create({ baseURL: API_BASE, timeout: 12000 });

let refreshing: Promise<string | null> | null = null;

async function ensureTokensLoaded() { await loadTokens(); }
ensureTokensLoaded();

api.interceptors.request.use(async (config) => {
    const at = getAccessTokenSync();
    if (at) {
        config.headers = config.headers ?? {};
        (config.headers as any).Authorization = `Bearer ${at}`;
    }
    return config;
});

api.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
        const original = error.config as any;
        if (error.response?.status === 401 && !original?._retry) {
            original._retry = true;

            if (!refreshing) {
                const rt = getRefreshTokenSync();
                if (!rt) {
                    await clearTokens();
                    emitAccessToken(null);
                    return Promise.reject(error);
                }
                refreshing = (async () => {
                    try {
                        const resp = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken: rt }, { timeout: 12000 });
                        const tokens = resp.data?.tokens as { accessToken: string; refreshToken: string };
                        if (tokens?.accessToken && tokens?.refreshToken) {
                            setAccessTokenSync(tokens.accessToken);
                            await saveTokens(tokens);
                            emitAccessToken(tokens.accessToken);
                            return tokens.accessToken;
                        }
                        await clearTokens();
                        emitAccessToken(null);
                        return null;
                    } catch {
                        await clearTokens();
                        emitAccessToken(null);
                        return null;
                    } finally {
                        refreshing = null;
                    }
                })();
            }

            const newAccess = await refreshing;
            if (newAccess) {
                original.headers = original.headers ?? {};
                original.headers.Authorization = `Bearer ${newAccess}`;
                return api.request(original);
            }
        }
        return Promise.reject(error);
    }
);

export type ApiResult<T> = { data: T };
