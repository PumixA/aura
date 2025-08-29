// src/realtime.ts
import type { FastifyInstance } from "fastify";
import { Server as IOServer } from "socket.io";
import bcrypt from "bcryptjs";

// TTL de présence (doit être cohérent avec le heartbeat de l'agent)
// Si l'agent envoie toutes les ~20s, on considère online si < 40s.
export const PRESENCE_TTL_MS = 40_000;

// deviceId -> set(socketId des AGENTS connectés)
type PresenceMap = Map<string, Set<string>>;

export function setupRealtime(app: FastifyInstance) {
    const io = new IOServer(app.server, {
        path: "/socket.io",
        cors: { origin: true }, // ⚠️ à durcir en prod
    });
    (app as any).__io = io;

    const nsp = io.of("/agent");
    const agentsByDevice: PresenceMap = new Map();

    // ───────────────── helpers présence / DB
    const presenceMemOnline = (deviceId: string) => agentsByDevice.has(deviceId);

    async function presenceDbOnline(deviceId: string): Promise<boolean> {
        try {
            const d = await (app as any).prisma.device.findUnique({
                where: { id: deviceId },
                select: { lastSeenAt: true },
            });
            if (!d?.lastSeenAt) return false;
            return Date.now() - new Date(d.lastSeenAt).getTime() <= PRESENCE_TTL_MS;
        } catch {
            return false;
        }
    }

    async function currentOnline(deviceId: string): Promise<boolean> {
        // online si agent en mémoire OU lastSeenAt récent
        if (presenceMemOnline(deviceId)) return true;
        return presenceDbOnline(deviceId);
    }

    async function markOnline(deviceId: string) {
        try {
            await (app as any).prisma.device.update({
                where: { id: deviceId },
                data: { lastSeenAt: new Date() },
                select: { id: true },
            });
        } catch (e) {
            app.log.warn(`markOnline failed for ${deviceId}: ${(e as Error).message}`);
        }
    }

    function addAgent(deviceId: string, socketId: string) {
        if (!agentsByDevice.has(deviceId)) agentsByDevice.set(deviceId, new Set());
        agentsByDevice.get(deviceId)!.add(socketId);
    }
    function removeAgent(deviceId: string, socketId: string) {
        const set = agentsByDevice.get(deviceId);
        if (!set) return;
        set.delete(socketId);
        if (set.size === 0) agentsByDevice.delete(deviceId);
    }

    function emitPresence(deviceId: string, online: boolean) {
        nsp.to(deviceId).emit("presence", { deviceId, online, ts: Date.now() });
    }

    // ───────────────── middleware d’auth
    nsp.use(async (socket, next) => {
        try {
            const authHeader = socket.handshake.headers["authorization"];
            const authToken = (socket.handshake as any).auth?.token as string | undefined;
            const deviceId = socket.handshake.headers["x-device-id"] as string | undefined;

            // 1) Auth ApiKey (AGENT)
            if (authHeader && typeof authHeader === "string" && authHeader.startsWith("ApiKey ") && deviceId) {
                const apiKey = authHeader.slice(7).trim();
                const device = await (app as any).prisma.device.findUnique({ where: { id: deviceId } });
                if (!device || device.disabled || !device.apiKeyHash) return next(new Error("device invalid/disabled"));
                const ok = await bcrypt.compare(apiKey, device.apiKeyHash);
                if (!ok) return next(new Error("invalid api key"));
                (socket as any).agent = true;
                (socket as any).deviceId = deviceId;
                return next();
            }

            // 2) Auth Bearer (UI) — header ou auth.token
            let bearer: string | null = null;
            if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
                bearer = authHeader.slice(7);
            } else if (typeof authToken === "string" && authToken.startsWith("Bearer ")) {
                bearer = authToken.slice(7);
            }
            if (bearer) {
                const payload = app.jwt.verify(bearer) as any;
                (socket as any).user = payload;
                (socket as any).agent = false;
                return next();
            }

            return next(new Error("unauthorized"));
        } catch (e) {
            return next(e as any);
        }
    });

    // ───────────────── événements
    nsp.on("connection", async (socket) => {
        const isAgent = !!(socket as any).agent;
        const did = (socket as any).deviceId as string | undefined;

        // Agents → join room + présence + DB
        if (isAgent && did) {
            socket.join(did);
            addAgent(did, socket.id);
            await markOnline(did);
            emitPresence(did, true);
            socket.emit("welcome", { ok: true, deviceId: did });
        }

        // Compat: certains agents envoient encore agent:register
        socket.on("agent:register", async (p) => {
            const devId = p?.deviceId || did;
            if (isAgent && typeof devId === "string" && devId) {
                socket.join(devId);
                (socket as any).deviceId = devId;
                addAgent(devId, socket.id);
                await markOnline(devId);
                emitPresence(devId, true);
                socket.emit("welcome", { ok: true, deviceId: devId });
            }
        });

        // UI demande à rejoindre la room d’un device
        socket.on("ui:join", async (msg) => {
            const devId = msg?.deviceId;
            if (typeof devId === "string" && devId) {
                socket.join(devId);
                // on répond immédiatement avec le statut courant (mémoire + DB)
                const online = await currentOnline(devId);
                socket.emit("presence", { deviceId: devId, online, ts: Date.now() });
            }
        });

        // ACK/NACK de l’agent
        socket.on("ack", async (ack) => {
            if (ack?.deviceId) {
                await markOnline(ack.deviceId);
                nsp.to(ack.deviceId).emit("agent:ack", ack);
                emitPresence(ack.deviceId, true);
            }
        });

        socket.on("nack", async (msg) => {
            if (msg?.deviceId) {
                nsp.to(msg.deviceId).emit("agent:nack", msg);
                try {
                    await (app as any).prisma?.audit?.create({
                        data: { deviceId: msg.deviceId, type: "AGENT_NACK", payload: msg },
                    });
                } catch (e) {
                    app.log.warn("Audit nack failed: " + (e as Error).message);
                }
            }
        });

        // Rapports d’état périodiques
        socket.on("state:report", async (msg) => {
            const devId = msg?.deviceId;
            if (!devId) {
                socket.emit("nack", { reason: "bad state:report" });
                return;
            }

            // Normalisation: accepter { state: {...} } ou les champs au top-level
            const state = msg.state ?? msg;
            const payload: any = { deviceId: devId };
            if (state.leds) payload.leds = state.leds;
            if (state.music) payload.music = state.music;
            if (state.widgets) payload.widgets = state.widgets;

            nsp.to(devId).emit("state:update", payload);

            if (isAgent) {
                await markOnline(devId);
                emitPresence(devId, true);
            }
        });

        // Déconnexion
        socket.on("disconnect", () => {
            if (isAgent) {
                const devId = (socket as any).deviceId as string | undefined;
                if (devId) {
                    removeAgent(devId, socket.id);
                    // si plus aucun agent en mémoire → présence false (on ne touche pas lastSeenAt)
                    if (!presenceMemOnline(devId)) emitPresence(devId, false);
                }
            }
        });
    });

    // ───────────────── endpoint debug (DEV)
    app.post(
        "/__debug/emit",
        {
            schema: {
                body: {
                    type: "object",
                    required: ["deviceId", "event", "payload"],
                    properties: {
                        deviceId: { type: "string" },
                        event: { type: "string" },
                        payload: { type: "object" },
                    },
                },
            },
        },
        async (req, res) => {
            const { deviceId, event, payload } = req.body as any;
            nsp.to(deviceId).emit(event, { ...payload, deviceId });
            return { ok: true };
        }
    );

    return { io, nsp };
}
