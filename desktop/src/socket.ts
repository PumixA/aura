import { io, Socket } from 'socket.io-client';
import { getToken } from './api/client';
import { useUI } from './store/ui';

const API_URL = (window as any).aura?.env?.API_URL || import.meta.env.VITE_API_URL;
let socket: Socket | null = null;

export function ensureSocket() {
    if (socket) return socket;
    socket = io(`${API_URL}/agent`, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: () => ({ token: `Bearer ${getToken() || ''}` }), // <-- ici
    } as any);

    socket.on('connect', () => console.log('ws connected', socket?.id));
    socket.on('state:update', (msg:any) => {
        const { state } = msg || {};
        if (state?.leds) useUI.setState({ leds: state.leds });
        if (state?.music) useUI.setState({ music: state.music });
    });
    socket.on('agent:ack', (ack:any) => {
        useUI.setState({ lastAck: `${ack?.type}:${ack?.status}` });
    });
    return socket;
}

export function joinDeviceRoom(deviceId:string) {
    ensureSocket().emit('ui:join', { deviceId });
}
