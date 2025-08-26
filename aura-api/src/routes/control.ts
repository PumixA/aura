import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const colorHex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const ledStateSchema = z.object({ on: z.boolean() });
const ledStyleSchema = z.object({
    color: colorHex.optional(),
    brightness: z.number().int().min(0).max(100).optional(),
    preset: z.string().optional()
}).refine((v) => v.color !== undefined || v.brightness !== undefined || v.preset !== undefined, {
    message: "At least one of color, brightness, preset must be provided"
});

const musicCmdSchema = z.object({
    action: z.enum(["play", "pause", "next", "prev"])
});
const musicVolumeSchema = z.object({
    value: z.number().int().min(0).max(100)
});

const control: FastifyPluginAsync = async (app) => {
    const authGuard = async (req: any) => { await req.jwtVerify() };

    const ensureOwnDevice = async (userId: string, deviceId: string) => {
        const d = await app.prisma.device.findUnique({
            where: { id: deviceId },
            select: { ownerId: true, disabled: true }
        });
        if (!d) throw app.httpErrors.notFound("Device not found");
        if (d.ownerId !== userId) throw app.httpErrors.forbidden("Not your device");
        if (d.disabled) throw app.httpErrors.conflict("Device disabled");
    };

    const io = () => (app as any).__io as import("socket.io").Server | undefined;
    const emitToAgent = (deviceId: string, event: string, payload: any) => {
        io()?.of("/agent").to(deviceId).emit(event, { ...payload, deviceId });
    };
    const emitStateUpdateToUIs = (deviceId: string, patch: any) => {
        io()?.of("/agent").to(deviceId).emit("state:update", { deviceId, ...patch });
    };

    const getLedSnapshot = async (deviceId: string) => {
        const led = await app.prisma.ledState.findUnique({ where: { deviceId } });
        return led
            ? { on: led.on, color: led.color, brightness: led.brightness, preset: led.preset ?? null }
            : { on: false, color: "#FFFFFF", brightness: 50, preset: null };
    };
    const getMusicSnapshot = async (deviceId: string) => {
        const m = await app.prisma.musicState.findUnique({ where: { deviceId } });
        return m
            ? { status: m.status as "play" | "pause", volume: m.volume, track: null }
            : { status: "pause" as const, volume: 50, track: null };
    };

    // ------- LEDs -------

    app.get("/devices/:id/leds", { onRequest: [authGuard] }, async (req: any) => {
        const deviceId = req.params.id as string;
        const userId = req.user.sub as string;
        await ensureOwnDevice(userId, deviceId);
        return await getLedSnapshot(deviceId);
    });

    app.post("/devices/:id/leds/state", { onRequest: [authGuard] }, async (req: any, rep) => {
        const deviceId = req.params.id as string;
        const userId = req.user.sub as string;
        await ensureOwnDevice(userId, deviceId);

        const body = ledStateSchema.parse(req.body);

        await app.prisma.$transaction(async (px) => {
            await px.ledState.upsert({
                where: { deviceId },
                update: { on: body.on },
                create: { deviceId, on: body.on, color: "#FFFFFF", brightness: 50 }
            });
            await px.audit.create({
                data: { userId, deviceId, type: "LED_SET", payload: { state: body } }
            });
        });

        emitToAgent(deviceId, "leds:update", body);
        const leds = await getLedSnapshot(deviceId);
        emitStateUpdateToUIs(deviceId, { leds });

        return rep.code(202).send({ accepted: true });
    });

    app.post("/devices/:id/leds/style", { onRequest: [authGuard] }, async (req: any, rep) => {
        const deviceId = req.params.id as string;
        const userId = req.user.sub as string;
        await ensureOwnDevice(userId, deviceId);

        const body = ledStyleSchema.parse(req.body);

        await app.prisma.$transaction(async (px) => {
            const current = await px.ledState.findUnique({ where: { deviceId } });
            await px.ledState.upsert({
                where: { deviceId },
                update: {
                    color: body.color ?? current?.color ?? "#FFFFFF",
                    brightness: body.brightness ?? current?.brightness ?? 50,
                    preset: body.preset !== undefined ? body.preset : current?.preset
                },
                create: {
                    deviceId,
                    on: current?.on ?? false,
                    color: body.color ?? "#FFFFFF",
                    brightness: body.brightness ?? 50,
                    preset: body.preset
                }
            });
            await px.audit.create({
                data: { userId, deviceId, type: "LED_SET", payload: { style: body } }
            });
        });

        emitToAgent(deviceId, "leds:update", body);
        const leds = await getLedSnapshot(deviceId);
        emitStateUpdateToUIs(deviceId, { leds });

        return rep.code(202).send({ accepted: true });
    });

    // ------- Music -------

    app.get("/devices/:id/music", { onRequest: [authGuard] }, async (req: any) => {
        const deviceId = req.params.id as string;
        const userId = req.user.sub as string;
        await ensureOwnDevice(userId, deviceId);
        return await getMusicSnapshot(deviceId);
    });

    app.post("/devices/:id/music/cmd", { onRequest: [authGuard] }, async (req: any, rep) => {
        const deviceId = req.params.id as string;
        const userId = req.user.sub as string;
        await ensureOwnDevice(userId, deviceId);

        const { action } = musicCmdSchema.parse(req.body);

        await app.prisma.$transaction(async (px) => {
            const current = await px.musicState.findUnique({ where: { deviceId } });
            let nextStatus: "play" | "pause" = current?.status === "play" ? "play" : "pause";
            if (action === "play") nextStatus = "play";
            if (action === "pause") nextStatus = "pause";

            await px.musicState.upsert({
                where: { deviceId },
                update: { status: nextStatus },
                create: { deviceId, status: nextStatus, volume: current?.volume ?? 50 }
            });

            await px.audit.create({
                data: { userId, deviceId, type: "MUSIC_CMD", payload: { action } }
            });
        });

        emitToAgent(deviceId, "music:cmd", { action });
        const music = await getMusicSnapshot(deviceId);
        emitStateUpdateToUIs(deviceId, { music });

        return rep.code(202).send({ accepted: true });
    });

    app.post("/devices/:id/music/volume", { onRequest: [authGuard] }, async (req: any, rep) => {
        const deviceId = req.params.id as string;
        const userId = req.user.sub as string;
        await ensureOwnDevice(userId, deviceId);

        const { value } = musicVolumeSchema.parse(req.body);

        await app.prisma.$transaction(async (px) => {
            const current = await px.musicState.findUnique({ where: { deviceId } });
            await px.musicState.upsert({
                where: { deviceId },
                update: { volume: value },
                create: { deviceId, status: current?.status ?? "pause", volume: value }
            });
            await px.audit.create({
                data: { userId, deviceId, type: "MUSIC_VOLUME", payload: { value } }
            });
        });

        emitToAgent(deviceId, "music:cmd", { action: "volume", value });
        const music = await getMusicSnapshot(deviceId);
        emitStateUpdateToUIs(deviceId, { music });

        return rep.code(202).send({ accepted: true });
    });
};

export default control;
