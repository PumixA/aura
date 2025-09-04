import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import crypto from 'crypto'
import bcrypt from 'bcrypt'

export type JWTPayload = { sub: string; email: string }

export function getAccessTTL() {
    return process.env.ACCESS_TOKEN_TTL || '15m'
}
export function getRefreshTTL() {
    return process.env.REFRESH_TOKEN_TTL || '30d'
}

export async function signAccessToken(app: FastifyInstance, payload: JWTPayload) {
    return app.jwt.sign(payload, { expiresIn: getAccessTTL() })
}

export function generateOpaqueToken() {
    return crypto.randomBytes(48).toString('base64url')
}

export async function hashToken(token: string) {
    const rounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12)
    return bcrypt.hash(token, rounds)
}

export async function verifyToken(token: string, hash: string) {
    return bcrypt.compare(token, hash)
}

export function msToMillis(ttl: string) {
    const m = ttl.match(/^(\d+)([smhd])$/)
    if (!m) return Number(ttl) || 0
    const n = Number(m[1]); const u = m[2] as 's'|'m'|'h'|'d'
    const map = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const
    return n * map[u]
}

export function registerAuthHook(app: FastifyInstance) {
    app.decorate('authenticate', async function (this: FastifyInstance, request: FastifyRequest) {
        try {
            await request.jwtVerify()
        } catch {
            throw app.httpErrors.unauthorized('Invalid or missing access token')
        }
    })

    app.decorateRequest('agentDeviceId', null as string | null)

    app.decorate('authenticateUserOrAgent', async function (
        this: FastifyInstance,
        request: FastifyRequest,
        reply: FastifyReply
    ) {
        const auth = request.headers['authorization']
        const xDeviceId = request.headers['x-device-id']

        if (typeof auth === 'string' && auth.startsWith('ApiKey ')) {
            if (!xDeviceId) {
                throw app.httpErrors.unauthorized('Missing x-device-id')
            }
            const apiKey = auth.slice('ApiKey '.length).trim()
            const deviceId = String(xDeviceId)

            const device = await (app as any).prisma.device.findUnique({
                where: { id: deviceId },
                select: { id: true, apiKey: true, disabled: true },
            })
            if (!device || device.disabled || device.apiKey !== apiKey) {
                throw app.httpErrors.unauthorized('Invalid device or ApiKey')
            }

            ;(request as any).agentDeviceId = deviceId
            return
        }

        if (!auth || !auth.startsWith('Bearer ')) {
            throw app.httpErrors.unauthorized('Invalid or missing access token')
        }
        try {
            await request.jwtVerify()
        } catch {
            throw app.httpErrors.unauthorized('Invalid or expired token')
        }
    })
}

declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (req: FastifyRequest) => Promise<void>
        authenticateUserOrAgent: (req: FastifyRequest, rep: FastifyReply) => Promise<void>
    }
    interface FastifyRequest {
        agentDeviceId: string | null
    }
}
