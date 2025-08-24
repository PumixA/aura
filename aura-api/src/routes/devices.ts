import type { FastifyPluginAsync } from "fastify";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const devices: FastifyPluginAsync = async (app) => {
    // Toutes les routes ici nécessitent un JWT user
    const authGuard = async (req: any) => {
        await req.jwtVerify();
    };

    const genApiKey = () => crypto.randomBytes(24).toString("base64url"); // ~32 chars, URL-safe

    // CREATE device → retourne la clé API EN CLAIR (une seule fois)
    app.post(
        "/devices",
        {
            onRequest: [authGuard],
            schema: {
                body: {
                    type: "object",
                    required: ["name"],
                    properties: { name: { type: "string", minLength: 1 } },
                },
            },
        },
        async (req: any) => {
            // ⚠️ ton JWT encode l'id user dans 'sub'
            const userId = req.user.sub as string;
            const { name } = req.body as { name: string };

            const apiKey = genApiKey();
            const apiKeyHash = await bcrypt.hash(apiKey, 12);

            const device = await (app as any).prisma.device.create({
                data: {
                    name,
                    ownerId: userId, // ✅ lie bien le device au créateur
                    apiKeyHash,
                },
                select: { id: true, name: true },
            });

            return { device, apiKey }; // la clé API n’est renvoyée qu’ici
        }
    );

    // LIST mes devices (sans clé)
    app.get(
        "/devices",
        { onRequest: [authGuard] },
        async (req: any) => {
            const userId = req.user.sub as string;
            const list = await (app as any).prisma.device.findMany({
                where: { ownerId: userId },
                select: {
                    id: true,
                    name: true,
                    createdAt: true,
                    disabled: true,
                    apiKeyHash: true,
                },
                orderBy: { createdAt: "desc" },
            });
            // on ne renvoie pas le hash, juste un indicateur
            return list.map((d: any) => ({
                id: d.id,
                name: d.name,
                createdAt: d.createdAt,
                disabled: d.disabled,
                hasApiKey: !!d.apiKeyHash,
            }));
        }
    );

    // ROTATE clé API → renvoie une NOUVELLE clé EN CLAIR (une seule fois)
    app.post(
        "/devices/:id/apikey/rotate",
        { onRequest: [authGuard] },
        async (req: any, rep) => {
            const userId = req.user.sub as string;
            const id = req.params.id as string;

            const device = await (app as any).prisma.device.findUnique({ where: { id } });
            if (!device || device.ownerId !== userId) {
                return rep.code(404).send({ message: "Device introuvable" });
            }

            const apiKey = genApiKey();
            const apiKeyHash = await bcrypt.hash(apiKey, 12);

            await (app as any).prisma.device.update({
                where: { id },
                data: { apiKeyHash },
            });

            return { deviceId: id, apiKey }; // montrer la nouvelle clé une seule fois
        }
    );

    // DISABLE / ENABLE device
    app.post(
        "/devices/:id/disable",
        { onRequest: [authGuard] },
        async (req: any, rep) => {
            const userId = req.user.sub as string;
            const id = req.params.id as string;

            const device = await (app as any).prisma.device.findUnique({ where: { id } });
            if (!device || device.ownerId !== userId) {
                return rep.code(404).send({ message: "Device introuvable" });
            }
            await (app as any).prisma.device.update({ where: { id }, data: { disabled: true } });
            return { ok: true };
        }
    );

    app.post(
        "/devices/:id/enable",
        { onRequest: [authGuard] },
        async (req: any, rep) => {
            const userId = req.user.sub as string;
            const id = req.params.id as string;

            const device = await (app as any).prisma.device.findUnique({ where: { id } });
            if (!device || device.ownerId !== userId) {
                return rep.code(404).send({ message: "Device introuvable" });
            }
            await (app as any).prisma.device.update({ where: { id }, data: { disabled: false } });
            return { ok: true };
        }
    );
};

export default devices;
