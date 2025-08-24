import { create } from 'zustand';

type LedState = { on:boolean; color:string; brightness:number };
type MusicState = { status:string; volume:number; track?:string };

type UI = {
    deviceId: string | null;
    setDevice: (id:string) => void;
    leds: LedState;
    music: MusicState;
    lastAck?: string;
};

export const useUI = create<UI>((set) => ({
    deviceId: null,
    setDevice: (id) => set({ deviceId: id }),
    leds: { on:false, color:'#FFFFFF', brightness:50 },
    music: { status:'pause', volume:50 }
}));
