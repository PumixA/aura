import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

const pairingRoutes: FastifyPluginAsync = async (app) => {
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

    app.post('/devices/:deviceId/pairing-token', async (req: any) => {
        const { deviceId } = req.params as { deviceId: string }
        await verifyAgentAuth(deviceId, req.headers)

        const token = crypto.randomInt(100000, 999999).toString() // 6 chiffres
        const expiresAt = new Date(Date.now() + 120 * 1000) // 120s

        await app.prisma.devicePairingToken.upsert({
            where: { deviceId },
            create: { deviceId, token, expiresAt },
            update: { token, expiresAt }
        })

        return { token, expiresAt }
    })
}

export default pairingRoutes
