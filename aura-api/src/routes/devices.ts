import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

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

    // --- Widgets: schemas & helpers ---
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

    const getWidgetsList = async (app: any, deviceId: string) => {
        return app.prisma.deviceWidget.findMany({
            where: { deviceId },
            select: { key: true, enabled: true, orderIndex: true, config: true },
            orderBy: { orderIndex: 'asc' }
        })
    }

    const emitWs = (app: any, deviceId: string, event: string, payload: any) => {
        const io = (app as any).__io as import("socket.io").Server | undefined
        io?.of("/agent").to(deviceId).emit(event, { deviceId, ...payload })
    }

// --- GET /devices/:deviceId/widgets ---
    app.get('/devices/:deviceId/widgets', { preHandler: app.authenticate }, async (req: any) => {
        const { deviceId } = req.params as { deviceId: string }
        const userId = req.user.sub as string
        await ensureOwnDevice(userId, deviceId)

        const widgets = await getWidgetsList(app, deviceId)
        return widgets
    })

// --- PUT /devices/:deviceId/widgets ---
    app.put('/devices/:deviceId/widgets', { preHandler: app.authenticate }, async (req: any) => {
        const { deviceId } = req.params as { deviceId: string }
        const userId = req.user.sub as string
        await ensureOwnDevice(userId, deviceId)

        const { items } = putWidgetsSchema.parse(req.body)

        await app.prisma.$transaction(async (px) => {
            // upsert pour chaque item fourni, on ne supprime rien qui n'est pas dans la liste
            for (const it of items) {
                await px.deviceWidget.upsert({
                    where: { deviceId_key: { deviceId, key: it.key } },
                    update: {
                        enabled: it.enabled ?? undefined,
                        orderIndex: it.orderIndex ?? undefined,
                        config: it.config ?? undefined
                    },
                    create: {
                        deviceId,
                        key: it.key,
                        enabled: it.enabled ?? true,
                        orderIndex: it.orderIndex ?? 0,
                        config: it.config ?? undefined
                    }
                })
            }
            await px.audit.create({
                data: { userId, deviceId, type: "WIDGETS_UPDATE", payload: { items } }
            })
        })

        const widgets = await getWidgetsList(app, deviceId)

        // WS: notifier l'agent + les UIs
        emitWs(app, deviceId, "widgets:update", { items })     // vers l'agent (payload demandé)
        emitWs(app, deviceId, "state:update", { widgets })     // snapshot pour UIs

        return { items: widgets }
    })

}



export default devicesRoutes
