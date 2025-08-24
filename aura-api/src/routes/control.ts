import type { FastifyPluginAsync } from "fastify";

const control: FastifyPluginAsync = async (app) => {
    const authGuard = async (req: any) => { await req.jwtVerify() };
    // @ts-ignore
    const io = (app as any).__io as import("socket.io").Server | undefined;
    const nsp = io?.of("/agent");

    // LEDs: POST /api/v1/devices/:id/leds/state
    app.post("/devices/:id/leds/state", { onRequest: [authGuard] }, async (req: any, rep) => {
        const deviceId = req.params.id as string;
        const payload = req.body || {};
        if (!nsp) return rep.code(503).send({ message: "realtime not ready" });
        nsp.to(deviceId).emit("leds:update", { ...payload, deviceId });
        return { ok: true };
    });

    // Music: POST /api/v1/devices/:id/music/cmd
    app.post("/devices/:id/music/cmd", { onRequest: [authGuard] }, async (req: any, rep) => {
        const deviceId = req.params.id as string;
        const payload = req.body || {};
        if (!nsp) return rep.code(503).send({ message: "realtime not ready" });
        nsp.to(deviceId).emit("music:cmd", { ...payload, deviceId });
        return { ok: true };
    });
};

export default control;
