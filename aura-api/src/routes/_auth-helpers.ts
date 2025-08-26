import type { FastifyInstance, FastifyRequest } from 'fastify'
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
}

declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (req: FastifyRequest) => Promise<void>
    }
}
