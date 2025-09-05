import type { FastifyInstance, FastifyPluginOptions } from 'fastify'

function boolFromEnv(v: string | undefined, def = false) {
    if (v === undefined) return def
    const s = v.trim().toLowerCase()
    return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

export default async function publicRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
    fastify.get('/config', {
        schema: {
            tags: ['Public'],
            summary: 'Public app config & feature flags',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        app: {
                            type: 'object',
                            properties: { minVersion: { type: 'string' } },
                            required: ['minVersion']
                        },
                        features: {
                            type: 'object',
                            properties: {
                                pairing: { type: 'boolean' },
                                weather: { type: 'boolean' },
                                debugEmit: { type: 'boolean' }
                            },
                            required: ['pairing','weather','debugEmit']
                        }
                    },
                    required: ['app','features']
                }
            }
        }
    }, async (_req, reply) => {
        const minVersion = process.env.PUBLIC_MIN_APP_VERSION || '0.1.0'
        const pairing   = boolFromEnv(process.env.FEATURE_PAIRING, true)
        const weather   = boolFromEnv(process.env.FEATURE_WEATHER, true)
        const debugEmit = boolFromEnv(process.env.FEATURE_DEBUG_EMIT, false)

        reply.header('Cache-Control', 'public, max-age=60')
        return { app: { minVersion }, features: { pairing, weather, debugEmit } }
    })
}
