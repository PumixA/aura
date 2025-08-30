// src/routes/devices.ts
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

// TTL de présence : cohérent avec heartbeat (~20s)
const PRESENCE_TTL_MS = 35_000

const pairSchema = z.object({
    deviceId: z.string().uuid(),
    pairingToken: z.string().min(4)
})

const renameSchema = z.object({
    name: z.string().min(1).max(100)
})

const devicesRoutes: FastifyPluginAsync = async (app) => {
    const ensureOwnDevice = async (userId: string, deviceId: string) => {
        const d = await app.prisma.device.findUnique({
            where: { id: deviceId },
            select: { ownerId: true, disabled: true }
        })
        if (!d) throw app.httpErrors.notFound('Device not found')
        if (d.ownerId !== userId) throw app.httpErrors.forbidden('Not your device')
        if (d.disabled) throw app.httpErrors.conflict('Device disabled')
    }

    // ---------- helpers realtime / widgets ----------
    const getWidgetsList = async (appAny: any, deviceId: string) => {
        return appAny.prisma.deviceWidget.findMany({
            where: { deviceId },
            select: { key: true, enabled: true, orderIndex: true, config: true },
            orderBy: { orderIndex: 'asc' }
        })
    }

    const emitWs = (appAny: any, deviceId: string, event: string, payload: any) => {
        const io = (appAny as any).__io as import("socket.io").Server | undefined
        io?.of("/agent").to(deviceId).emit(event, { deviceId, ...payload })
    }

    const touchDevicePresence = async (appAny: any, deviceId: string) => {
        const now = new Date()
        await appAny.prisma.device.update({
            where: { id: deviceId },
            data: { lastSeenAt: now },
            select: { id: true }
        })
        emitWs(appAny, deviceId, 'presence', { online: true, lastSeenAt: now.toISOString() })
    }

    // Auth ApiKey pour AGENT (Authorization: ApiKey <clé> + x-device-id)
    const verifyAgentApiKey = async (appAny: any, req: any, deviceIdFromPath?: string) => {
        const auth = req.headers['authorization']
        const didHeader = req.headers['x-device-id'] as string | undefined
        if (!auth || typeof auth !== 'string' || !auth.startsWith('ApiKey ') || !didHeader) {
            throw app.httpErrors.unauthorized('Missing ApiKey or x-device-id')
        }
        const plain = auth.slice(7).trim()
        const deviceId = deviceIdFromPath ?? didHeader
        if (deviceId !== didHeader) throw app.httpErrors.unauthorized('x-device-id mismatch')

        const dev = await appAny.prisma.device.findUnique({
            where: { id: deviceId },
            select: { apiKeyHash: true, disabled: true }
        })
        if (!dev || dev.disabled || !dev.apiKeyHash) {
            throw app.httpErrors.unauthorized('Device invalid/disabled')
        }
        const ok = await bcrypt.compare(plain, dev.apiKeyHash)
        if (!ok) throw app.httpErrors.unauthorized('Invalid ApiKey')
        return deviceId
    }

    // ---------- GET /devices : ajoute online/lastSeenAt ----------
    app.get('/devices', { preHandler: app.authenticate }, async (req: any) => {
        const userId = req.user.sub as string

        const devices = await app.prisma.device.findMany({
            where: { ownerId: userId },
            select: {
                id: true,
                name: true,
                createdAt: true,
                disabled: true,
                lastSeenAt: true
            },
            orderBy: { createdAt: 'asc' }
        })

        const now = Date.now()
        return devices.map(d => {
            const last = d.lastSeenAt ? d.lastSeenAt.getTime() : 0
            const online = !!last && (now - last) <= PRESENCE_TTL_MS && !d.disabled
            return {
                id: d.id,
                name: d.name,
                createdAt: d.createdAt,
                disabled: d.disabled,
                online,
                lastSeenAt: d.lastSeenAt ?? null
            }
        })
    })

    // ---------- GET /devices/:deviceId/online : fallback par lastSeenAt ----------
    app.get('/devices/:deviceId/online', { preHandler: app.authenticate }, async (req: any) => {
        const { deviceId } = req.params as { deviceId: string }
        const userId = req.user.sub as string
        await ensureOwnDevice(userId, deviceId)

        const d = await app.prisma.device.findUnique({
            where: { id: deviceId },
            select: { lastSeenAt: true, disabled: true }
        })
        if (!d) throw app.httpErrors.notFound()

        const last = d.lastSeenAt ? d.lastSeenAt.getTime() : 0
        const online = !!last && (Date.now() - last) <= PRESENCE_TTL_MS && !d.disabled
        return { online, lastSeenAt: d.lastSeenAt ?? null }
    })

    // ---------- Pairing ----------
    app.post('/devices/pair', { preHandler: app.authenticate }, async (req: any, reply) => {
        const { deviceId, pairingToken } = pairSchema.parse(req.body)
        const userId = req.user.sub as string

        const token = await app.prisma.devicePairingToken.findUnique({
            where: { deviceId },
            select: { token: true, expiresAt: true }
        })
        if (!token) return reply.code(400).send({ error: 'BadRequest', message: 'No active pairing token' })

        const now = new Date()
        if (token.expiresAt <= now) {
            await app.prisma.devicePairingToken.delete({ where: { deviceId } })
            return reply.code(410).send({ error: 'Gone', message: 'Pairing token expired' })
        }
        if (token.token !== pairingToken) {
            return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid pairing token' })
        }

        const device = await app.prisma.device.findUnique({
            where: { id: deviceId },
            select: { id: true, name: true, ownerId: true, disabled: true }
        })
        if (!device) return reply.code(404).send({ error: 'NotFound', message: 'Device not found' })
        if (device.disabled) return reply.code(409).send({ error: 'Conflict', message: 'Device disabled' })
        if (device.ownerId && device.ownerId !== userId) {
            return reply.code(409).send({ error: 'Conflict', message: 'Device already paired' })
        }

        const updated = await app.prisma.$transaction(async (px) => {
            const d = await px.device.update({
                where: { id: deviceId },
                data: { ownerId: userId, pairedAt: now }
            })
            await px.devicePairingToken.delete({ where: { deviceId } })
            await px.audit.create({ data: { userId, deviceId, type: 'DEVICE_PAIRED', payload: {} } })
            return d
        })

        return reply.send({ device: { id: updated.id, name: updated.name } })
    })

    // ---------- Rename ----------
    app.put('/devices/:deviceId', { preHandler: app.authenticate }, async (req: any) => {
        const { deviceId } = req.params as { deviceId: string }
        const { name } = renameSchema.parse(req.body)
        const userId = req.user.sub as string

        await ensureOwnDevice(userId, deviceId)

        const device = await app.prisma.device.update({
            where: { id: deviceId },
            data: { name },
            select: { id: true, name: true }
        })
        return { device }
    })

    // ---------- Delete ----------
    app.delete('/devices/:deviceId', { preHandler: app.authenticate }, async (req: any, reply) => {
        const { deviceId } = req.params as { deviceId: string }
        const userId = req.user.sub as string
        await ensureOwnDevice(userId, deviceId)

        await app.prisma.$transaction(async (px) => {
            const d = await px.device.findUnique({ where: { id: deviceId }, select: { id: true, name: true } })
            await px.audit.create({
                data: {
                    userId,
                    type: 'DEVICE_DELETED',
                    deviceId: null,
                    payload: { deletedDeviceId: d?.id, name: d?.name }
                }
            })
            await px.device.delete({ where: { id: deviceId } })
        })

        return reply.code(204).send()
    })

    // ---------- Snapshot ----------
    app.get('/devices/:deviceId/state', { preHandler: app.authenticate }, async (req: any) => {
        const { deviceId } = req.params as { deviceId: string }
        const userId = req.user.sub as string

        await ensureOwnDevice(userId, deviceId)

        const [led, music, widgets] = await Promise.all([
            app.prisma.ledState.findUnique({ where: { deviceId } }),
            app.prisma.musicState.findUnique({ where: { deviceId } }),
            app.prisma.deviceWidget.findMany({
                where: { deviceId },
                select: { key: true, enabled: true, orderIndex: true, config: true },
                orderBy: { orderIndex: 'asc' }
            })
        ])

        return {
            leds: led
                ? { on: led.on, color: led.color, brightness: led.brightness, preset: led.preset ?? null }
                : { on: false, color: '#FFFFFF', brightness: 50, preset: null },
            music: music
                ? { status: music.status, volume: music.volume, track: null }
                : { status: 'pause', volume: 50, track: null },
            widgets
        }
    })

    // ---------- Widgets ----------
    const AllowedWidgetKeys = ["clock","weather","music","leds"] as const
    const widgetItemSchema = z.object({
        key: z.enum(AllowedWidgetKeys),
        enabled: z.boolean().optional(),
        orderIndex: z.number().int().min(0).optional(),
        config: z.any().optional()
    })
    const putWidgetsSchema = z.object({
        items: z.array(widgetItemSchema).min(1)
    })

    app.get('/devices/:deviceId/widgets', { preHandler: app.authenticate }, async (req: any) => {
        const { deviceId } = req.params as { deviceId: string }
        const userId = req.user.sub as string
        await ensureOwnDevice(userId, deviceId)

        const widgets = await getWidgetsList(app, deviceId)
        return widgets
    })

    app.put('/devices/:deviceId/widgets', { preHandler: app.authenticate }, async (req: any) => {
        const { deviceId } = req.params as { deviceId: string }
        const userId = req.user.sub as string
        await ensureOwnDevice(userId, deviceId)

        const { items } = putWidgetsSchema.parse(req.body)

        // 🔎 LOGS D'ENTRÉE
        app.log.info({ deviceId, items }, 'PUT widgets: incoming items')

        await app.prisma.$transaction(async (px) => {
            for (const it of items) {
                await px.deviceWidget.upsert({
                    where: { deviceId_key: { deviceId, key: it.key } },
                    update: {
                        enabled: it.enabled ?? undefined,
                        orderIndex: it.orderIndex ?? undefined,
                        config: it.config ?? undefined,
                    },
                    create: {
                        deviceId,
                        key: it.key,
                        enabled: it.enabled ?? true,
                        orderIndex: it.orderIndex ?? 0,
                        config: it.config ?? undefined,
                    },
                })
            }
            await px.audit.create({
                data: { userId, deviceId, type: 'WIDGETS_UPDATE', payload: { items } }
            })
        })

        const widgets = await getWidgetsList(app, deviceId)

        // 🔎 LOGS DE SORTIE (ce qui est vraiment en BDD)
        app.log.info({ deviceId, widgets }, 'PUT widgets: stored list')

        emitWs(app, deviceId, 'widgets:update', { items })
        emitWs(app, deviceId, 'state:update', { widgets })

        return { items: widgets }
    })
}

export default devicesRoutes
