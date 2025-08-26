import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import dotenv from "dotenv";
import sensible from '@fastify/sensible';
dotenv.config();

import prismaPlugin from "./plugins/prisma";
import health from "./routes/health";
import auth from "./routes/auth";
import devices from "./routes/devices";
import control from "./routes/control";
import meRoutes from './routes/me'
import pairingRoutes from './routes/pairing';
import publicRoutes from "./routes/public";
import weatherRoutes from "./routes/weather";
import { registerAuthHook } from "./routes/_auth-helpers";
import { setupRealtime } from "./realtime";


const app = Fastify({ logger: true });

async function start() {
    await app.register(cors, { origin: true });
    await app.register(jwt, { secret: process.env.JWT_SECRET! });
    await app.register(sensible);
    registerAuthHook(app);
    await app.register(swagger, {
        openapi: { info: { title: "Aura API", version: "1.0.0" } }
    });
    await app.register(swaggerUI, { routePrefix: "/docs" });
    await app.register(prismaPlugin);

    app.register(async (scope) => {
        scope.register(health);
        scope.register(auth);
        scope.register(devices);
        scope.register(control);
        scope.register(meRoutes);
        scope.register(pairingRoutes);
        scope.register(weatherRoutes);

        scope.register(publicRoutes, { prefix: '/public' });
    }, { prefix: "/api/v1" });

    setupRealtime(app);

    const port = Number(process.env.PORT || 3000);
    const address = await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`HTTP listening at ${address}`);
}

start().catch((err) => {
    app.log.error(err);
    process.exit(1);
});
