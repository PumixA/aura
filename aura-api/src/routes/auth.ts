import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcrypt";
import {
    signAccessToken,
    generateOpaqueToken,
    hashToken,
    verifyToken,
    getRefreshTTL,
    msToMillis
} from "./_auth-helpers";

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});

const refreshSchema = z.object({
    refreshToken: z.string().min(10),
});

const authRoutes: FastifyPluginAsync = async (app) => {
    // REGISTER
    app.post("/auth/register", async (req, reply) => {
        const body = registerSchema.parse(req.body);

        const exists = await app.prisma.user.findUnique({ where: { email: body.email }});
        if (exists) return reply.code(409).send({ error: "Conflict", message: "Email already in use" });

        const passwordHash = await bcrypt.hash(body.password, Number(process.env.BCRYPT_SALT_ROUNDS || 12));

        const user = await app.prisma.user.create({
            data: {
                email: body.email,
                passwordHash,
                firstName: body.firstName,
                lastName: body.lastName,
                // crée les prefs par défaut
                prefs: { create: {} }
            },
            select: { id: true, email: true, firstName: true, lastName: true }
        });

        const accessToken = await signAccessToken(app, { sub: user.id, email: user.email });
        const refreshToken = generateOpaqueToken();
        const refreshHash = await hashToken(refreshToken);
        const expiresAt = new Date(Date.now() + msToMillis(getRefreshTTL()));

        await app.prisma.session.create({
            data: {
                userId: user.id,
                refreshTokenHash: refreshHash,
                expiresAt,
                ip: req.ip || undefined,
                userAgent: (req.headers["user-agent"] as string) || undefined
            }
        });

        return reply.code(201).send({
            user,
            tokens: { accessToken, refreshToken }
        });
    });

    // LOGIN
    app.post("/auth/login", async (req, reply) => {
        const body = loginSchema.parse(req.body);

        const found = await app.prisma.user.findUnique({ where: { email: body.email }});
        if (!found) return reply.code(401).send({ error: "Unauthorized", message: "Invalid credentials" });

        const ok = await bcrypt.compare(body.password, found.passwordHash);
        if (!ok) return reply.code(401).send({ error: "Unauthorized", message: "Invalid credentials" });

        const user = { id: found.id, email: found.email, firstName: found.firstName, lastName: found.lastName };

        const accessToken = await signAccessToken(app, { sub: user.id, email: user.email });
        const refreshToken = generateOpaqueToken();
        const refreshHash = await hashToken(refreshToken);
        const expiresAt = new Date(Date.now() + msToMillis(getRefreshTTL()));

        await app.prisma.session.create({
            data: {
                userId: user.id,
                refreshTokenHash: refreshHash,
                expiresAt,
                ip: req.ip || undefined,
                userAgent: (req.headers["user-agent"] as string) || undefined
            }
        });

        return reply.send({ user, tokens: { accessToken, refreshToken } });
    });

    // REFRESH
    app.post("/auth/refresh", async (req, reply) => {
        const { refreshToken } = refreshSchema.parse(req.body);

        const now = new Date();
        // Simple et sûr pour v1: on parcourt les sessions non expirées
        const sessions = await app.prisma.session.findMany({
            where: { expiresAt: { gt: now } }
        });

        let matched: typeof sessions[number] | null = null;
        for (const s of sessions) {
            if (await verifyToken(refreshToken, s.refreshTokenHash)) {
                matched = s; break;
            }
        }
        if (!matched) return reply.code(401).send({ error: "Unauthorized", message: "Invalid or expired refresh token" });

        const user = await app.prisma.user.findUnique({ where: { id: matched.userId } });
        if (!user) {
            await app.prisma.session.delete({ where: { id: matched.id } });
            return reply.code(401).send({ error: "Unauthorized", message: "Session no longer valid" });
        }

        // Rotation du refresh: on invalide l’ancien, on recrée un nouveau
        await app.prisma.session.delete({ where: { id: matched.id } });

        const newRefresh = generateOpaqueToken();
        const newHash = await hashToken(newRefresh);
        const expiresAt = new Date(Date.now() + msToMillis(getRefreshTTL()));

        await app.prisma.session.create({
            data: {
                userId: user.id,
                refreshTokenHash: newHash,
                expiresAt,
                ip: req.ip || undefined,
                userAgent: (req.headers["user-agent"] as string) || undefined
            }
        });

        const accessToken = await signAccessToken(app, { sub: user.id, email: user.email });

        return reply.send({ tokens: { accessToken, refreshToken: newRefresh } });
    });

    // LOGOUT
    app.post("/auth/logout", async (req, reply) => {
        const { refreshToken } = refreshSchema.parse(req.body);

        const sessions = await app.prisma.session.findMany();
        for (const s of sessions) {
            if (await verifyToken(refreshToken, s.refreshTokenHash)) {
                await app.prisma.session.delete({ where: { id: s.id } });
                break;
            }
        }
        return reply.code(204).send();
    });
};

export default authRoutes;
