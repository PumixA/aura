import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const putMeSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    prefs: z.object({
        theme: z.enum(['light','dark']).optional(),
        unitSystem: z.enum(['metric','imperial']).optional(),
        locale: z.string().optional(),
        widgetsOrder: z.any().optional()
    }).optional()
})

const meRoutes: FastifyPluginAsync = async (app) => {
    app.get('/me', { preHandler: app.authenticate }, async (req: any) => {
        const userId = req.user.sub as string
        const u = await app.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, email: true, firstName: true, lastName: true,
                prefs: { select: { theme: true, unitSystem: true, locale: true, widgetsOrder: true } }
            }
        })
        if (!u) throw app.httpErrors.notFound()
        return {
            user: { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName },
            prefs: u.prefs ?? { theme: 'light', unitSystem: 'metric', locale: 'fr-FR', widgetsOrder: null }
        }
    })

    app.put('/me', { preHandler: app.authenticate }, async (req: any) => {
        const body = putMeSchema.parse(req.body)
        const userId = req.user.sub as string

        const data: any = {}
        if (body.firstName !== undefined) data.firstName = body.firstName
        if (body.lastName !== undefined) data.lastName = body.lastName

        const fresh = await app.prisma.$transaction(async (px) => {
            await px.user.update({ where: { id: userId }, data })
            if (body.prefs) {
                await px.userPrefs.upsert({
                    where: { userId },
                    create: { userId, ...body.prefs },
                    update: { ...body.prefs }
                })
            }
            return px.user.findUnique({
                where: { id: userId },
                select: {
                    id: true, email: true, firstName: true, lastName: true,
                    prefs: { select: { theme: true, unitSystem: true, locale: true, widgetsOrder: true } }
                }
            })
        })

        return {
            user: { id: fresh!.id, email: fresh!.email, firstName: fresh!.firstName, lastName: fresh!.lastName },
            prefs: fresh!.prefs ?? { theme: 'light', unitSystem: 'metric', locale: 'fr-FR', widgetsOrder: null }
        }
    })

    app.get('/me/sessions', { preHandler: app.authenticate }, async (req: any) => {
        const userId = req.user.sub as string
        const sessions = await app.prisma.session.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, createdAt: true, ip: true, userAgent: true }
        })
        const deviceFromUA = (ua?: string | null) => {
            if (!ua) return 'web'
            const s = ua.toLowerCase()
            if (s.includes('android') || s.includes('iphone')) return 'mobile'
            return 'web'
        }
        return sessions.map(s => ({
            id: s.id,
            device: deviceFromUA(s.userAgent),
            createdAt: s.createdAt,
            ip: s.ip ?? null
        }))
    })

    app.delete('/me/sessions/:id', { preHandler: app.authenticate }, async (req: any, reply) => {
        const userId = req.user.sub as string
        const { id } = req.params as { id: string }
        const sess = await app.prisma.session.findUnique({ where: { id } })
        if (!sess || sess.userId !== userId) throw app.httpErrors.notFound()
        await app.prisma.session.delete({ where: { id } })
        return reply.code(204).send()
    })
}

export default meRoutes
