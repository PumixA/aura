import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcrypt";

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

const authRoutes: FastifyPluginAsync = async (app) => {
    app.post("/auth/register", async (req, reply) => {
        const body = registerSchema.parse(req.body);
        const exists = await app.prisma.user.findUnique({ where: { email: body.email }});
        if (exists) return reply.code(409).send({ error: "Conflict", message: "Email already in use" });

        const passwordHash = await bcrypt.hash(body.password, Number(process.env.BCRYPT_SALT_ROUNDS || 12));
        const user = await app.prisma.user.create({
            data: { email: body.email, passwordHash, firstName: body.firstName, lastName: body.lastName }
        });
        const accessToken = app.jwt.sign({ sub: user.id, email: user.email });
        return reply.code(201).send({ user: { id: user.id, email: user.email }, tokens: { accessToken } });
    });

    app.post("/auth/login", async (req, reply) => {
        const body = loginSchema.parse(req.body);
        const user = await app.prisma.user.findUnique({ where: { email: body.email }});
        if (!user) return reply.code(401).send({ error: "Unauthorized", message: "Invalid credentials" });
        const ok = await bcrypt.compare(body.password, user.passwordHash);
        if (!ok) return reply.code(401).send({ error: "Unauthorized", message: "Invalid credentials" });
        const accessToken = app.jwt.sign({ sub: user.id, email: user.email });
        return { user: { id: user.id, email: user.email }, tokens: { accessToken } };
    });
};

export default authRoutes;
