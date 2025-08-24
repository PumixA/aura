import { FastifyPluginAsync } from "fastify";

const health: FastifyPluginAsync = async (app) => {
    app.get("/health", async () => ({ status: "ok", uptime: process.uptime() }));
};

export default health;
