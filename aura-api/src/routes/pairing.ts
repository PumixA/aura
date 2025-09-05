// src/routes/pairing.ts
import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'

function getIO(app: any) {
    return (app as any).__io as import('socket.io').Server | undefined
}
function emitWs(app: any, deviceId: string, event: string, payload: any) {
    getIO(app)?.of('/agent').to(deviceId).emit(event, { deviceId, ...payload })
}

/** Vérifie ApiKey + x-device-id pour un AGENT/Desktop */
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
     * Génération d’un pairing token par l’AGENT/Desktop (ApiKey + x-device-id).
     * Body optionnel: { transfer?: boolean }
     * - transfer=false => appairage initial
     * - transfer=true  => token de transfert (autorise réassignation)
     */
    app.post('/devices/:deviceId/pairing-token', async (req: any) => {
        const { deviceId } = req.params as { deviceId: string }
        await verifyAgentAuth(app, deviceId, req.headers)

        const transfer = !!(req.body?.transfer)
        const token = Math.floor(100000 + Math.random() * 900000).toString()
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 min

        await app.prisma.devicePairingToken.upsert({
            where: { deviceId },
            create: { deviceId, token, expiresAt, transfer },
            update: { token, expiresAt, transfer }
        })

        return { token, expiresAt, transfer }
    })

    /**
     * Heartbeat HTTP envoyé par l’AGENT (toutes les ~15–20s).
     */
    app.post('/devices/:deviceId/heartbeat', async (req: any, reply) => {
        const { deviceId } = req.params as { deviceId: string }
        await verifyAgentAuth(app, deviceId, req.headers)

        const body = (req.body ?? {}) as {
            status?: 'ok' | 'degraded'
            metrics?: { cpu?: number; mem?: number; temp?: number }
        }

        const now = new Date()

        await app.prisma.device.update({
            where: { id: deviceId },
            data: { lastSeenAt: now },
            select: { id: true }
        })

        try {
            await app.prisma.audit.create({
                data: { deviceId, type: 'DEVICE_HEARTBEAT', payload: body }
            })
        } catch (e) {
            app.log.warn({ err: e }, 'Audit DEVICE_HEARTBEAT failed')
        }

        emitWs(app, deviceId, 'presence', { online: true, lastSeenAt: now.toISOString() })
        emitWs(app, deviceId, 'agent:ack', { at: now.toISOString() })
        emitWs(app, deviceId, 'agent:heartbeat', { ...body, at: now.toISOString() })

        return reply.code(204).send()
    })
}

export default pairingRoutes
