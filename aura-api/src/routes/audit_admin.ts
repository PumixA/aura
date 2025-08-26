import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const auditsQuerySchema = z.object({
    deviceId: z.string().uuid().optional(),
    type: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50)
})

const adminOnly = async (app: any, userId: string) => {
    const u = await app.prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!u) throw app.httpErrors.unauthorized()
    if (u.role !== 'admin') throw app.httpErrors.forbidden('Admin only')
}

const auditAdminRoutes: FastifyPluginAsync = async (app) => {
    const authGuard = async (req: any) => { await req.jwtVerify() }

    // GET /audits?deviceId=&type=&limit=
    app.get('/audits', { preHandler: app.authenticate }, async (req: any) => {
        const userId = req.user.sub as string
        const q = auditsQuerySchema.parse(req.query)

        // admin ?
        const me = await app.prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
        const isAdmin = me?.role === 'admin'

        const whereBase: any = {}
        if (q.deviceId) whereBase.deviceId = q.deviceId
        if (q.type) whereBase.type = q.type

        // Si admin → tout (avec filtres). Sinon → restreint à mes devices / mes audits
        const where = isAdmin
            ? whereBase
            : {
                AND: [
                    whereBase,
                    {
                        OR: [
                            { userId },                           // actions faites par moi
                            { device: { ownerId: userId } }       // ou liées à mes devices
                        ]
                    }
                ]
            }

        const items = await app.prisma.audit.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: q.limit,
            select: { id: true, userId: true, deviceId: true, type: true, payload: true, createdAt: true }
        })

        return items
    })

    // GET /admin/devices  (admin only)
    app.get('/admin/devices', { preHandler: app.authenticate }, async (req: any) => {
        const userId = req.user.sub as string
        await adminOnly(app, userId)

        const items = await app.prisma.device.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true, name: true, ownerId: true, disabled: true,
                createdAt: true, pairedAt: true
            }
        })
        return items
    })

    // GET /admin/users  (admin only)
    app.get('/admin/users', { preHandler: app.authenticate }, async (req: any) => {
        const userId = req.user.sub as string
        await adminOnly(app, userId)

        const items = await app.prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true }
        })
        return items
    })

    // POST /admin/devices/:id/revoke  (admin only)
    app.post('/admin/devices/:id/revoke', { preHandler: app.authenticate }, async (req: any) => {
        const userId = req.user.sub as string
        await adminOnly(app, userId)

        const { id } = req.params as { id: string }

        const updated = await app.prisma.$transaction(async (px: any) => {
            const d = await px.device.update({
                where: { id },
                data: { disabled: true, apiKeyHash: null },
                select: { id: true, name: true, disabled: true }
            })
            await px.audit.create({
                data: { userId, deviceId: id, type: 'ADMIN_DEVICE_REVOKE', payload: {} }
            })
            return d
        })

        return { device: updated }
    })
}

export default auditAdminRoutes
