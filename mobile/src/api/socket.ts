import { io, Socket } from 'socket.io-client';
import { API_BASE } from '../lib/env';

function computeWsOrigin(apiBase: string): string {
    try {
        let base = apiBase.replace(/\/+$/, '');
        base = base.replace(/\/api\/v\d+$/i, '');
        return base || apiBase;
    } catch {
        return apiBase;
    }
}

const ORIGIN = computeWsOrigin(API_BASE);
const NAMESPACE = '/agent';
const SOCKET_PATH = '/socket.io';

type ServerToClientEvents = {
    'state:update': (payload: any) => void;
    'agent:ack': (payload: { deviceId: string; type?: string; status?: string; data?: any }) => void;
    'agent:nack': (payload: { deviceId: string; reason?: string; type?: string; error?: string }) => void;
    'agent:heartbeat': (payload: { deviceId: string; status?: 'ok' | 'degraded'; metrics?: any }) => void;
    'presence': (payload: { deviceId: string; online: boolean }) => void;
};

type ClientToServerEvents = {
    'ui:join': (payload: { deviceId: string }) => void;
};

export type DeviceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createDeviceSocket(accessToken: string): DeviceSocket {
    const socket = io(`${ORIGIN}${NAMESPACE}`, {
        path: SOCKET_PATH,
        transports: ['websocket'],
        forceNew: true,
        timeout: 10_000,
        reconnection: true,
        reconnectionAttempts: 0,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        auth: { token: `Bearer ${accessToken}` },
    }) as DeviceSocket;


    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        socket.on('connect', () => console.log('[socket] connected', `${ORIGIN}${NAMESPACE}`));
        socket.on('connect_error', (e) => console.warn('[socket] connect_error', e?.message || e));
        socket.on('disconnect', (r) => console.log('[socket] disconnected', r));
    }

    return socket;
}
