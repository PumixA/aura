import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'

const pairingRoutes: FastifyPluginAsync = async (app) => {
    const verifyAgentAuth = async (deviceId: string, headers: any) => {
        const auth = headers['authorization'] as string | undefined
        const did = headers['x-device-id'] as string | undefined
        if (!auth || !auth.startsWith('ApiKey ') || !did) throw app.httpErrors.unauthorized('Missing ApiKey or x-device-id')
        if (did !== deviceId) throw app.httpErrors.forbidden('x-device-id mismatch')

        const apiKey = auth.slice('ApiKey '.length).trim()
        const d = await app.prisma.device.findUnique({ where: { id: deviceId }, select: { apiKeyHash: true, disabled: true } })
        if (!d) throw app.httpErrors.notFound('Device not found')
        if (!d.apiKeyHash) throw app.httpErrors.unauthorized('No ApiKey set for device')
        if (d.disabled) throw app.httpErrors.conflict('Device disabled')

        const ok = await bcrypt.compare(apiKey, d.apiKeyHash)
        if (!ok) throw app.httpErrors.unauthorized('Invalid ApiKey')
    }

    app.post('/devices/:deviceId/pairing-token', async (req: any) => {
        const { deviceId } = req.params as { deviceId: string }
        await verifyAgentAuth(deviceId, req.headers)

        const token = Math.floor(100000 + Math.random() * 900000).toString()
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000)

        await app.prisma.devicePairingToken.upsert({
            where: { deviceId },
            create: { deviceId, token, expiresAt },
            update: { token, expiresAt }
        })

        return { token, expiresAt }
    })

    app.post('/devices/:deviceId/heartbeat', async (req: any, reply) => {
        const { deviceId } = req.params as { deviceId: string }
        await verifyAgentAuth(deviceId, req.headers)

        const body = (req.body ?? {}) as { status?: 'ok' | 'degraded'; metrics?: { cpu?: number; mem?: number; temp?: number } }

        await app.prisma.audit.create({
            data: { deviceId, type: 'DEVICE_HEARTBEAT', payload: body }
        })

        const io = (app as any).__io as import('socket.io').Server | undefined
        io?.of('/agent').to(deviceId).emit('agent:heartbeat', { deviceId, ...body })

        return reply.code(204).send()
    })
}

export default pairingRoutes
