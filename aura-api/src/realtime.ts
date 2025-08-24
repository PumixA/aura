import type { FastifyInstance } from "fastify"
import { Server as IOServer } from "socket.io"
import bcrypt from "bcryptjs"

/**
 * Realtime hub:
 *  - Namespace /agent pour les miroirs
 *  - Auth ApiKey (Authorization: ApiKey <clé>) OU JWT (Bearer) en fallback
 *  - Rooms par deviceId
 *  - Debug endpoint __debug/emit (DEV)
 */
export function setupRealtime(app: FastifyInstance) {
    const io = new IOServer(app.server, {
        path: "/socket.io",
        cors: { origin: true }, // durcir en prod
    });
    (app as any).__io = io;
    const nsp = io.of("/agent")

    nsp.use(async (socket, next) => {
        try {
            const authHeader = socket.handshake.headers["authorization"];
            const authToken = (socket.handshake as any).auth?.token as string | undefined;
            const deviceId = socket.handshake.headers["x-device-id"] as string | undefined;

            // 1) ApiKey pour AGENT
            if (authHeader && typeof authHeader === "string" && authHeader.startsWith("ApiKey ") && deviceId) {
                const apiKey = authHeader.slice(7).trim();
                const device = await (app as any).prisma.device.findUnique({ where: { id: deviceId } });
                if (!device || device.disabled || !device.apiKeyHash) return next(new Error("device invalid/disabled"));
                const ok = await bcrypt.compare(apiKey, device.apiKeyHash);
                if (!ok) return next(new Error("invalid api key"));
                (socket as any).deviceId = deviceId;
                return next();
            }

            // 2) Bearer pour UI — depuis header OU auth.token
            let bearer: string | null = null;
            if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
                bearer = authHeader.slice(7);
            } else if (typeof authToken === "string" && authToken.startsWith("Bearer ")) {
                bearer = authToken.slice(7);
            }

            if (bearer) {
                const payload = app.jwt.verify(bearer) as any;
                (socket as any).user = payload;
                return next();
            }

            return next(new Error("unauthorized"));
        } catch (e) {
            return next(e as any);
        }
    });

    nsp.on("connection", (socket) => {
        const did = (socket as any).deviceId as string | undefined
        if (did) socket.join(did)

        socket.on("agent:register", (p) => {
            const d = p?.deviceId
            if (typeof d === "string" && d) socket.join(d)
            socket.emit("welcome", { ok: true })
        })

        socket.on("ui:join", (msg) => {
            // UI avec JWT appelle ceci pour écouter un device
            const devId = msg?.deviceId;
            if (typeof devId === "string" && devId) socket.join(devId);
        });

        socket.on("ack", (ack) => {
            if (ack?.deviceId) nsp.to(ack.deviceId).emit("agent:ack", ack)
        })

        socket.on("state:report", (msg) => {
            if (msg?.deviceId) nsp.to(msg.deviceId).emit("state:update", msg)
        })
    })

    // DEV uniquement : émettre une commande vers un device
    app.post("/__debug/emit", {
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
    }, async (req, res) => {
        const { deviceId, event, payload } = req.body as any
        nsp.to(deviceId).emit(event, { ...payload, deviceId })
        return { ok: true }
    })

    return { io, nsp }
}
