import * as SecureStore from 'expo-secure-store';

export type AuthTokens = { accessToken: string; refreshToken: string };

const KEY = 'aura.tokens.v1';
let memory: AuthTokens | null = null;

export async function loadTokens(): Promise<AuthTokens | null> {
    if (memory) return memory;
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    try {
        memory = JSON.parse(raw);
        return memory;
    } catch {
        return null;
    }
}

export async function saveTokens(t: AuthTokens): Promise<void> {
    memory = t;
    await SecureStore.setItemAsync(KEY, JSON.stringify(t));
}

export async function clearTokens(): Promise<void> {
    memory = null;
    await SecureStore.deleteItemAsync(KEY);
}

export function getAccessTokenSync(): string | null {
    return memory?.accessToken ?? null;
}

export function setAccessTokenSync(token: string) {
    if (memory) memory.accessToken = token;
}

export function getRefreshTokenSync(): string | null {
    return memory?.refreshToken ?? null;
}
