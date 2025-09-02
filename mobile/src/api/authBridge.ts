let listener: ((token: string | null) => void) | null = null;

export function registerAccessTokenListener(fn: (token: string | null) => void) {
    listener = fn;
}

export function emitAccessToken(token: string | null) {
    try { listener?.(token); } catch {}
}
