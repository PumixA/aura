export type MusicState = {
    status: 'play' | 'pause';
    volume: number;
    track?: string | null;
};

export type LedsState = {
    on: boolean;
    color: string;
    brightness: number;
    preset?: string | null;
};

export type DeviceSnapshot = {
    leds: LedsState;
    music: MusicState;
    widgets: any;
};
