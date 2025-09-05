import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";

const colorHex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const ledStateSchema = z.object({ on: z.boolean() });

const ledStyleSchema = z.object({
    color: colorHex.optional(),
    brightness: z.number().int().min(0).max(100).optional(),
    preset: z.string().nullable().optional(),
}).refine(
    (v) => v.color !== undefined || v.brightness !== undefined || v.preset !== undefined,
    { message: "Provide one of color|brightness|preset" }
);

const musicCmdSchema = z.object({ action: z.enum(["play", "pause", "next", "prev"]) });
const musicVolumeSchema = z.object({ value: z.number().int().min(0).max(100) });

function isAgentRequest(req: any) {
    const auth = req.headers["authorization"];
    const did = req.headers["x-device-id"];
    return typeof auth === "string" && auth.startsWith("ApiKey ") && !!did;
}

async function verifyAgentApiKey(appAny: any, req: any, deviceIdFromPath?: string) {
    const auth = req.headers["authorization"];
    const didHeader = req.headers["x-device-id"] as string | undefined;
    if (!auth || typeof auth !== "string" || !auth.startsWith("ApiKey ") || !didHeader) {
        throw appAny.httpErrors.unauthorized("Missing ApiKey or x-device-id");
    }
    const plain = auth.slice(7).trim();
    const deviceId = deviceIdFromPath ?? didHeader;
    if (deviceId !== didHeader) throw appAny.httpErrors.unauthorized("x-device-id mismatch");

    const dev = await appAny.prisma.device.findUnique({
        where: { id: deviceId },
        select: { apiKeyHash: true, disabled: true },
    });
    if (!dev || dev.disabled || !dev.apiKeyHash) {
        throw appAny.httpErrors.unauthorized("Device invalid/disabled");
    }
    const ok = await bcrypt.compare(plain, dev.apiKeyHash);
    if (!ok) throw appAny.httpErrors.unauthorized("Invalid ApiKey");
    return deviceId;
}

async function ensureOwnDevice(appAny: any, userId: string, deviceId: string) {
    const d = await appAny.prisma.device.findUnique({
        where: { id: deviceId },
        select: { ownerId: true, disabled: true },
    });
    if (!d) throw appAny.httpErrors.notFound("Device not found");
    if (d.ownerId !== userId) throw appAny.httpErrors.forbidden("Not your device");
    if (d.disabled) throw appAny.httpErrors.conflict("Device disabled");
}

function io(appAny: any) {
    return (appAny as any).__io as import("socket.io").Server | undefined;
}

function emitToAgent(appAny: any, deviceId: string, event: string, payload: any) {
    io(appAny)?.of("/agent").to(deviceId).emit(event, { deviceId, ...payload });
}

function emitStateToUIs(appAny: any, deviceId: string, patch: any) {
    io(appAny)?.of("/agent").to(deviceId).emit("state:update", { deviceId, ...patch });
}

async function touchPresence(appAny: any, deviceId: string) {
    const now = new Date();
    await appAny.prisma.device.update({
        where: { id: deviceId },
        data: { lastSeenAt: now },
        select: { id: true },
    });
    io(appAny)?.of("/agent").to(deviceId).emit("presence", {
        deviceId,
        online: true,
        lastSeenAt: now.toISOString(),
    });
}

async function getLedSnapshot(appAny: any, deviceId: string) {
    const led = await appAny.prisma.ledState.findUnique({ where: { deviceId } });
    return led
        ? { on: led.on, color: led.color, brightness: led.brightness, preset: led.preset ?? null }
        : { on: false, color: "#FFFFFF", brightness: 50, preset: null };
}

async function getMusicSnapshot(appAny: any, deviceId: string) {
    const m = await appAny.prisma.musicState.findUnique({ where: { deviceId } });
    return m
        ? { status: m.status as "play" | "pause", volume: m.volume, track: null }
        : { status: "pause" as const, volume: 50, track: null };
}

const control: FastifyPluginAsync = async (app) => {
    // LEDs: on/off
    app.post("/devices/:id/leds/state", async (req: any, rep) => {
        const deviceId = req.params.id as string;

        let userId: string | null = null;
        if (isAgentRequest(req)) {
            await verifyAgentApiKey(app, req, deviceId);
        } else {
            await app.authenticate(req);
            userId = req.user.sub as string;
            await ensureOwnDevice(app, userId, deviceId);
        }

        const body = ledStateSchema.parse(req.body);

        await app.prisma.$transaction(async (px) => {
            await px.ledState.upsert({
                where: { deviceId },
                update: { on: body.on },
                create: { deviceId, on: body.on, color: "#FFFFFF", brightness: 50, preset: null },
            });
            if (userId) {
                await px.audit.create({
                    data: { userId, deviceId, type: "LED_SET_STATE", payload: { state: body } },
                });
            }
        });

        emitToAgent(app, deviceId, "leds:state", { on: body.on });

        const leds = await getLedSnapshot(app, deviceId);
        emitStateToUIs(app, deviceId, { leds });

        await touchPresence(app, deviceId);
        return rep.code(202).send({ accepted: true });
    });

    app.post("/devices/:id/leds/style", async (req: any, rep) => {
        const deviceId = req.params.id as string;

        let userId: string | null = null;
        if (isAgentRequest(req)) {
            await verifyAgentApiKey(app, req, deviceId);
        } else {
            await app.authenticate(req);
            userId = req.user.sub as string;
            await ensureOwnDevice(app, userId, deviceId);
        }

        const body = ledStyleSchema.parse(req.body);

        await app.prisma.$transaction(async (px) => {
            const current = await px.ledState.findUnique({ where: { deviceId } });
            const update: any = {};
            if (typeof body.color !== "undefined") update.color = body.color.toUpperCase();
            if (typeof body.brightness !== "undefined") update.brightness = body.brightness;
            if ("preset" in body) update.preset = body.preset;
            update.on = true;

            await px.ledState.upsert({
                where: { deviceId },
                update,
                create: {
                    deviceId,
                    on: true,
                    color: typeof body.color !== "undefined" ? body.color.toUpperCase() : current?.color ?? "#FFFFFF",
                    brightness: typeof body.brightness !== "undefined" ? body.brightness : current?.brightness ?? 50,
                    preset: "preset" in body ? body.preset : current?.preset ?? null,
                },
            });

            if (userId) {
                await px.audit.create({
                    data: { userId, deviceId, type: "LED_SET_STYLE", payload: { style: body } },
                });
            }
        });

        emitToAgent(app, deviceId, "leds:style", { ...body });

        const leds = await getLedSnapshot(app, deviceId);
        emitStateToUIs(app, deviceId, { leds });

        await touchPresence(app, deviceId);
        return rep.code(202).send({ accepted: true });
    });

    app.post("/devices/:id/music/volume", async (req: any, rep) => {
        const deviceId = req.params.id as string;

        let userId: string | null = null;
        if (isAgentRequest(req)) {
            await verifyAgentApiKey(app, req, deviceId);
        } else {
            await app.authenticate(req);
            userId = req.user.sub as string;
            await ensureOwnDevice(app, userId, deviceId);
        }

        const { value } = musicVolumeSchema.parse(req.body);

        const stored = await app.prisma.musicState.upsert({
            where: { deviceId },
            update: { volume: value },
            create: { deviceId, status: "pause", volume: value },
        });

        if (userId) {
            await app.prisma.audit.create({
                data: { userId, deviceId, type: "MUSIC_VOLUME", payload: { value } },
            });
        }

        emitToAgent(app, deviceId, "music:volume", { music: { volume: value } });

        emitStateToUIs(app, deviceId, {
            music: { status: stored.status as "play" | "pause", volume: stored.volume, track: null },
        });

        await touchPresence(app, deviceId);
        return rep.code(202).send({ accepted: true });
    });

    app.post("/devices/:id/music/cmd", async (req: any, rep) => {
        const deviceId = req.params.id as string;

        let userId: string | null = null;
        if (isAgentRequest(req)) {
            await verifyAgentApiKey(app, req, deviceId);
        } else {
            await app.authenticate(req);
            userId = req.user.sub as string;
            await ensureOwnDevice(app, userId, deviceId);
        }

        const { action } = musicCmdSchema.parse(req.body);

        const existing = await app.prisma.musicState.findUnique({ where: { deviceId } });
        let nextStatus: "play" | "pause" = existing?.status === "play" ? "play" : "pause";
        if (action === "play") nextStatus = "play";
        if (action === "pause") nextStatus = "pause";

        const stored = await app.prisma.musicState.upsert({
            where: { deviceId },
            update: { status: nextStatus },
            create: { deviceId, status: nextStatus, volume: existing?.volume ?? 50 },
        });

        if (userId) {
            await app.prisma.audit.create({
                data: { userId, deviceId, type: "MUSIC_CMD", payload: { action } },
            });
        }

        emitToAgent(app, deviceId, "music:cmd", { music: { action } });

        emitStateToUIs(app, deviceId, {
            music: { status: stored.status as "play" | "pause", volume: stored.volume, track: null },
        });

        await touchPresence(app, deviceId);
        return rep.code(202).send({ accepted: true });
    });
};

export default control;
