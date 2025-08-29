// src/routes/pairing.ts
import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'

/**
 * Helpers
 */
function getIO(app: any) {
    return (app as any).__io as import('socket.io').Server | undefined
}

/** Emit vers toutes les UIs abonnées à la room deviceId */
function emitWs(app: any, deviceId: string, event: string, payload: any) {
    getIO(app)?.of('/agent').to(deviceId).emit(event, { deviceId, ...payload })
}

/** Vérifie ApiKey + x-device-id pour un AGENT */
async function verifyAgentAuth(app: any, deviceId: string, headers: any) {
    const auth = headers['authorization'] as string | undefined
    const did = headers['x-device-id'] as string | undefined

    if (!auth || !auth.startsWith('ApiKey ') || !did) {
        throw app.httpErrors.unauthorized('Missing ApiKey or x-device-id')
    }
    if (did !== deviceId) {
        throw app.httpErrors.forbidden('x-device-id mismatch')
    }

    const apiKey = auth.slice('ApiKey '.length).trim()
    const d = await app.prisma.device.findUnique({
        where: { id: deviceId },
        select: { apiKeyHash: true, disabled: true }
    })

    if (!d) throw app.httpErrors.notFound('Device not found')
    if (!d.apiKeyHash) throw app.httpErrors.unauthorized('No ApiKey set for device')
    if (d.disabled) throw app.httpErrors.conflict('Device disabled')

    const ok = await bcrypt.compare(apiKey, d.apiKeyHash)
    if (!ok) throw app.httpErrors.unauthorized('Invalid ApiKey')
}

const pairingRoutes: FastifyPluginAsync = async (app) => {
    /**
     * Génération d’un pairing token par l’AGENT déjà autorisé par ApiKey.
     * (utile si le miroir affiche un code à saisir dans l’app).
     */
    app.post('/devices/:deviceId/pairing-token', async (req: any) => {
        const { deviceId } = req.params as { deviceId: string }
        await verifyAgentAuth(app, deviceId, req.headers)

        const token = Math.floor(100000 + Math.random() * 900000).toString()
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000) // 2 min

        await app.prisma.devicePairingToken.upsert({
            where: { deviceId },
            create: { deviceId, token, expiresAt },
            update: { token, expiresAt }
        })

        return { token, expiresAt }
    })

    /**
     * Heartbeat HTTP envoyé par l’AGENT (toutes les ~15–20s).
     * - Auth ApiKey + x-device-id
     * - Met à jour Device.lastSeenAt
     * - Notifie les UIs via Socket.IO: presence + agent:ack (+ agent:heartbeat pour compat)
     *
     * ⚠️ Assure-toi qu’aucune autre route ne déclare le même chemin,
     * sinon Fastify lèvera FST_ERR_DUPLICATED_ROUTE.
     */
    app.post('/devices/:deviceId/heartbeat', async (req: any, reply) => {
        const { deviceId } = req.params as { deviceId: string }
        await verifyAgentAuth(app, deviceId, req.headers)

        // payload facultatif: status/metrics
        const body = (req.body ?? {}) as {
            status?: 'ok' | 'degraded'
            metrics?: { cpu?: number; mem?: number; temp?: number }
        }

        const now = new Date()

        // 1) Persist presence côté BDD
        await app.prisma.device.update({
            where: { id: deviceId },
            data: { lastSeenAt: now },
            select: { id: true }
        })

        // 2) Audit léger (optionnel mais pratique pour debug)
        try {
            await app.prisma.audit.create({
                data: { deviceId, type: 'DEVICE_HEARTBEAT', payload: body }
            })
        } catch (e) {
            app.log.warn({ err: e }, 'Audit DEVICE_HEARTBEAT failed')
        }

        // 3) Notifs realtime pour l’UI
        emitWs(app, deviceId, 'presence', { online: true, lastSeenAt: now.toISOString() })
        emitWs(app, deviceId, 'agent:ack', { at: now.toISOString() })
        // compat (si certains clients écoutent encore ceci)
        emitWs(app, deviceId, 'agent:heartbeat', { ...body, at: now.toISOString() })

        // 204 No Content (pas de body nécessaire)
        return reply.code(204).send()
    })
}

export default pairingRoutes
