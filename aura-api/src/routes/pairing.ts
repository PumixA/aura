import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

const pairingRoutes: FastifyPluginAsync = async (app) => {
    // Vérification ApiKey agent
    const verifyAgentAuth = async (deviceId: string, headers: any) => {
        const auth = headers['authorization'] as string | undefined
        const deviceHdr = headers['x-device-id'] as string | undefined
        if (!auth || !auth.startsWith('ApiKey ') || !deviceHdr) throw app.httpErrors.unauthorized('Missing ApiKey or x-device-id')
        if (deviceHdr !== deviceId) throw app.httpErrors.forbidden('x-device-id mismatch')

        const apiKey = auth.slice('ApiKey '.length)
        const device = await app.prisma.device.findUnique({
            where: { id: deviceId },
            select: { apiKeyHash: true, disabled: true }
        })
        if (!device) throw app.httpErrors.notFound('Device not found')
        if (!device.apiKeyHash) throw app.httpErrors.unauthorized('No ApiKey set for device')
        if (device.disabled) throw app.httpErrors.conflict('Device disabled')

        const ok = await bcrypt.compare(apiKey, device.apiKeyHash)
        if (!ok) throw app.httpErrors.unauthorized('Invalid ApiKey')
    }

    // POST /devices/:deviceId/pairing-token
    app.post('/devices/:deviceId/pairing-token', async (req: any) => {
        const { deviceId } = req.params as { deviceId: string }
        await verifyAgentAuth(deviceId, req.headers)

        const token = crypto.randomInt(100000, 999999).toString()
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000) // 2 minutes TTL

        await app.prisma.devicePairingToken.upsert({
            where: { deviceId },
            create: { deviceId, token, expiresAt },
            update: { token, expiresAt }
        })

        return { token, expiresAt }
    })

    // POST /devices/:deviceId/heartbeat
    app.post('/devices/:deviceId/heartbeat', async (req: any, reply) => {
        const { deviceId } = req.params as { deviceId: string }
        await verifyAgentAuth(deviceId, req.headers)

        const body = req.body as {
            status?: 'ok' | 'degraded'
            metrics?: { cpu?: number; mem?: number; temp?: number }
        }

        await app.prisma.device.update({
            where: { id: deviceId },
            data: { /* champs pour lastSeen/online */
                // ⚠️ ajoute dans le schéma si tu veux `lastSeenAt` / `online`
                // exemple si champs déjà existants:
                // lastSeenAt: new Date(),
                // online: true
            }
        })

        await app.prisma.audit.create({
            data: {
                deviceId,
                type: 'DEVICE_HEARTBEAT',
                payload: body
            }
        })

        return reply.code(204).send()
    })
}

export default pairingRoutes
