import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

type CacheEntry = { data: any; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

const weatherRoutes: FastifyPluginAsync = async (app) => {
    // /api/v1/weather?city=Paris&units=metric|imperial
    app.get("/weather", async (req, reply) => {
        const querySchema = z.object({
            city: z.string().min(1),
            units: z.enum(["metric", "imperial"]).optional().default("metric"),
        });
        const { city, units } = querySchema.parse((req as any).query);
        const key = `${city.toLowerCase()}::${units}`;

        // cache hit?
        const hit = cache.get(key);
        const now = Date.now();
        if (hit && hit.expiresAt > now) {
            const ttlSec = Math.max(0, Math.floor((hit.expiresAt - now) / 1000));
            return reply.send({ ...hit.data, ttlSec });
        }

        // mock deterministic (stable pour un même city) + petite variation temporelle
        const seed = Array.from(city.toLowerCase()).reduce((a, c) => a + c.charCodeAt(0), 0);
        const cycle = Math.floor(now / (60 * 60 * 1000)); // change doucement chaque heure
        const base = (seed * 31 + cycle * 7) % 35; // [-] amplitude
        let tempC = 6 + base; // 6..40 °C environ
        // variations légères
        tempC = Math.round((tempC + ((cycle % 5) - 2) * 0.7) * 10) / 10;

        const descPool = ["clear", "partly cloudy", "cloudy", "light rain", "showers", "mist"];
        const iconPool = ["sun", "cloud-sun", "cloud", "rain", "rain-heavy", "fog"];
        const idx = (seed + cycle) % descPool.length;
        const desc = descPool[idx];
        const icon = iconPool[idx];

        const temp = units === "metric" ? tempC : Math.round((tempC * 9) / 5 + 32); // °F
        const updatedAt = new Date().toISOString();

        const data = { city, units, temp, desc, icon, updatedAt };
        cache.set(key, { data, expiresAt: now + TTL_MS });

        return reply.send({ ...data, ttlSec: Math.floor(TTL_MS / 1000) });
    });
};

export default weatherRoutes;
