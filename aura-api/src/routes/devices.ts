import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

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

    // PUT /devices/:deviceId  (rename)
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

    // DELETE /devices/:deviceId  (hard delete)
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
                    deviceId: null, // <-- pas de FK
                    payload: { deletedDeviceId: d?.id, name: d?.name }
                }
            })
            await px.device.delete({ where: { id: deviceId } })
        })

        return reply.code(204).send()
    })

    // GET /devices/:deviceId/state  (snapshot global)
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
}

export default devicesRoutes
