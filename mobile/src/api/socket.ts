// src/api/socket.ts
import { io, Socket } from 'socket.io-client';
import { API_BASE } from '../lib/env';

export type DeviceSocket = Socket<{
    // events we EMIT
    'ui:join': (payload: { deviceId: string }) => void;
}, {
    // events we RECEIVE
    'state:update': (payload: any) => void;
    'ack': (payload: { deviceId: string; type: string; data?: any }) => void;
    'nack': (payload: { deviceId: string; type: string; error?: string }) => void;
}>;

/**
 * Crée un socket sur le namespace "/agent" avec auth JWT.
 * Le serveur attend handshake.auth.token = "Bearer <JWT>".
 */
export function createDeviceSocket(accessToken: string): DeviceSocket {
    const socket = io(`${API_BASE}/agent`, {
        path: '/socket.io',
        transports: ['websocket'], // plus fiable en RN
        forceNew: true,            // éviter le partage de connexion par défaut
        auth: {
            token: `Bearer ${accessToken}`,
        },
    }) as DeviceSocket;

    return socket;
}
