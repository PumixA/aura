// src/plugins/auto-schemas.ts
import type { FastifyPluginAsync } from "fastify";

/**
 * Schémas réutilisables pour l'ensemble des routes Aura.
 * NB: Les $id sont pensés pour être utilisés via $ref: "<ID>#"
 * Exemple: response 200 -> { user: { $ref: "User#" }, prefs: { $ref: "UserPrefs#" } }
 */
const schemas = [
    // ─────────────────────────────────────────────────────────────────────────────
    // 0) Health & Public
    // ─────────────────────────────────────────────────────────────────────────────
    {
        $id: "HealthResponse",
        type: "object",
        properties: {
            status: { type: "string", enum: ["ok"] },
            uptime: { type: "number" },
            version: { type: "string", nullable: true }
        },
        required: ["status", "uptime"],
        example: { status: "ok", uptime: 123.456, version: "1.0.0" }
    },
    {
        $id: "PublicConfig",
        type: "object",
        properties: {
            app: {
                type: "object",
                properties: { minVersion: { type: "string" } },
                required: ["minVersion"]
            },
            features: {
                type: "object",
                properties: {
                    pairing: { type: "boolean" },
                    weather: { type: "boolean" },
                    debugEmit: { type: "boolean" }
                },
                required: ["pairing", "weather", "debugEmit"]
            }
        },
        required: ["app", "features"],
        example: {
            app: { minVersion: "0.1.0" },
            features: { pairing: true, weather: true, debugEmit: false }
        }
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // 1) Auth & Sessions
    // ─────────────────────────────────────────────────────────────────────────────
    {
        $id: "User",
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
            firstName: { type: "string", nullable: true },
            lastName: { type: "string", nullable: true }
        },
        required: ["id", "email"],
        example: {
            id: "37bfce36-e569-46dd-b6b3-7f3c1b98c668",
            email: "alice@example.com",
            firstName: "Alice",
            lastName: "Martin"
        }
    },
    {
        $id: "UserPrefs",
        type: "object",
        properties: {
            theme: { type: "string", enum: ["light", "dark"] },
            unitSystem: { type: "string", enum: ["metric", "imperial"] },
            locale: { type: "string" },
            widgetsOrder: {}
        },
        example: { theme: "light", unitSystem: "metric", locale: "fr-FR", widgetsOrder: null }
    },
    {
        $id: "AuthTokens",
        type: "object",
        properties: {
            accessToken: { type: "string" },
            refreshToken: { type: "string" }
        },
        required: ["accessToken", "refreshToken"],
        example: {
            accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            refreshToken: "rfr_8s9d7f...example..."
        }
    },
    {
        $id: "AuthRegisterBody",
        type: "object",
        required: ["email", "password"],
        properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            firstName: { type: "string" },
            lastName: { type: "string" }
        },
        example: {
            email: "alice@example.com",
            password: "SuperSecret#1",
            firstName: "Alice",
            lastName: "Martin"
        }
    },
    {
        $id: "AuthRegisterResponse",
        type: "object",
        properties: {
            user: { $ref: "User#" },
            tokens: { $ref: "AuthTokens#" }
        },
        required: ["user", "tokens"]
    },
    {
        $id: "AuthLoginBody",
        type: "object",
        required: ["email", "password"],
        properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 }
        },
        example: { email: "alice@example.com", password: "SuperSecret#1" }
    },
    {
        $id: "AuthLoginResponse",
        type: "object",
        properties: {
            user: { $ref: "User#" },
            tokens: { $ref: "AuthTokens#" }
        },
        required: ["user", "tokens"]
    },
    {
        $id: "AuthRefreshBody",
        type: "object",
        required: ["refreshToken"],
        properties: { refreshToken: { type: "string" } },
        example: { refreshToken: "rfr_8s9d7f...example..." }
    },
    {
        $id: "AuthRefreshResponse",
        type: "object",
        properties: { tokens: { $ref: "AuthTokens#" } },
        required: ["tokens"]
    },
    {
        $id: "AuthLogoutBody",
        type: "object",
        required: ["refreshToken"],
        properties: { refreshToken: { type: "string" } },
        example: { refreshToken: "rfr_8s9d7f...example..." }
    },
    {
        $id: "SessionItem",
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            device: { type: "string", enum: ["web", "mobile", "agent"] },
            createdAt: { type: "string", format: "date-time" },
            ip: { type: "string", nullable: true }
        },
        required: ["id", "device", "createdAt"],
        example: {
            id: "9c2f2b2a-6d04-4a54-822b-7a3f2d9e1c5a",
            device: "web",
            createdAt: "2025-08-27T18:05:00.000Z",
            ip: "192.168.1.10"
        }
    },
    {
        $id: "SessionsList",
        type: "array",
        items: { $ref: "SessionItem#" }
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // 2) Devices (User)
    // ─────────────────────────────────────────────────────────────────────────────
    {
        $id: "DeviceListItem",
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            disabled: { type: "boolean" },
            online: { type: "boolean", nullable: true },
            lastSeenAt: { type: "string", format: "date-time", nullable: true }
        },
        required: ["id", "name", "createdAt", "disabled"],
        example: {
            id: "89e81262-2101-4f6a-9969-40b81a18d929",
            name: "Miroir Salon",
            createdAt: "2025-08-24T15:37:27.390Z",
            disabled: false,
            online: true,
            lastSeenAt: "2025-08-27T18:37:00.000Z"
        }
    },
    {
        $id: "DeviceSimple",
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" }
        },
        required: ["id", "name"],
        example: { id: "89e81262-2101-4f6a-9969-40b81a18d929", name: "Miroir Salon" }
    },
    {
        $id: "DevicePairBody",
        type: "object",
        required: ["deviceId", "pairingToken"],
        properties: {
            deviceId: { type: "string", format: "uuid" },
            pairingToken: { type: "string", minLength: 4 }
        },
        example: { deviceId: "89e81262-2101-4f6a-9969-40b81a18d929", pairingToken: "123456" }
    },
    {
        $id: "DeviceRenameBody",
        type: "object",
        required: ["name"],
        properties: { name: { type: "string", minLength: 1, maxLength: 100 } },
        example: { name: "Miroir Chambre" }
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // 3) Pairing (Agent)
    // ─────────────────────────────────────────────────────────────────────────────
    {
        $id: "PairingTokenResponse",
        type: "object",
        properties: {
            token: { type: "string" },
            expiresAt: { type: "string", format: "date-time" }
        },
        required: ["token", "expiresAt"],
        example: { token: "123456", expiresAt: "2025-08-27T18:45:00.000Z" }
    },
    {
        $id: "HeartbeatBody",
        type: "object",
        properties: {
            status: { type: "string", enum: ["ok", "degraded"] },
            metrics: {
                type: "object",
                properties: {
                    cpu: { type: "number" },
                    mem: { type: "number" },
                    temp: { type: "number" }
                }
            }
        },
        example: { status: "ok", metrics: { cpu: 12.5, mem: 48.3, temp: 41.2 } }
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // 4) LEDs
    // ─────────────────────────────────────────────────────────────────────────────
    {
        $id: "LedState",
        type: "object",
        properties: {
            on: { type: "boolean" },
            color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
            brightness: { type: "integer", minimum: 0, maximum: 100 },
            preset: { type: "string", nullable: true }
        },
        required: ["on", "color", "brightness"],
        example: { on: true, color: "#00A3FF", brightness: 42, preset: "ocean" }
    },
    {
        $id: "LedToggleBody",
        type: "object",
        required: ["on"],
        properties: { on: { type: "boolean" } },
        example: { on: true }
    },
    {
        $id: "LedStyleBody",
        type: "object",
        properties: {
            color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
            brightness: { type: "integer", minimum: 0, maximum: 100 },
            preset: { type: "string" }
        },
        example: { color: "#00A3FF", brightness: 42, preset: "ocean" }
    },
    {
        $id: "Accepted202",
        type: "object",
        properties: { accepted: { type: "boolean" } },
        required: ["accepted"],
        example: { accepted: true }
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // 5) Musique
    // ─────────────────────────────────────────────────────────────────────────────
    {
        $id: "MusicState",
        type: "object",
        properties: {
            status: { type: "string", enum: ["play", "pause"] },
            volume: { type: "integer", minimum: 0, maximum: 100 },
            track: { type: "object", nullable: true }
        },
        required: ["status", "volume"],
        example: { status: "pause", volume: 50, track: null }
    },
    {
        $id: "MusicCmdBody",
        type: "object",
        required: ["action"],
        properties: { action: { type: "string", enum: ["play", "pause", "next", "prev"] } },
        example: { action: "pause" }
    },
    {
        $id: "MusicVolumeBody",
        type: "object",
        required: ["value"],
        properties: { value: { type: "integer", minimum: 0, maximum: 100 } },
        example: { value: 35 }
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // 6) Widgets
    // ─────────────────────────────────────────────────────────────────────────────
    {
        $id: "WidgetItem",
        type: "object",
        properties: {
            key: { type: "string", enum: ["clock", "weather", "music", "leds"] },
            enabled: { type: "boolean" },
            orderIndex: { type: "integer", minimum: 0 },
            config: {}
        },
        required: ["key", "enabled", "orderIndex"],
        example: { key: "weather", enabled: true, orderIndex: 1, config: { city: "Paris", units: "metric" } }
    },
    {
        $id: "WidgetsList",
        type: "array",
        items: { $ref: "WidgetItem#" },
        example: [
            { key: "clock", enabled: true, orderIndex: 0, config: { format: "24h" } },
            { key: "weather", enabled: true, orderIndex: 1, config: { city: "Paris", units: "metric" } },
            { key: "music", enabled: true, orderIndex: 2, config: {} }
        ]
    },
    {
        $id: "WidgetsPutBody",
        type: "object",
        required: ["items"],
        properties: {
            items: {
                type: "array",
                minItems: 1,
                items: { $ref: "WidgetItem#" }
            }
        },
        example: {
            items: [
                { key: "clock", enabled: true, orderIndex: 0, config: { format: "24h" } },
                { key: "weather", enabled: true, orderIndex: 1, config: { city: "Paris", units: "metric" } }
            ]
        }
    },
    {
        $id: "WidgetsPutResponse",
        type: "object",
        properties: { items: { $ref: "WidgetsList#" } },
        required: ["items"]
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // 7) Weather (mock)
    // ─────────────────────────────────────────────────────────────────────────────
    {
        $id: "WeatherResponse",
        type: "object",
        properties: {
            city: { type: "string" },
            units: { type: "string", enum: ["metric", "imperial"] },
            temp: { type: "number" },
            desc: { type: "string" },
            icon: { type: "string" },
            updatedAt: { type: "string", format: "date-time" },
            ttlSec: { type: "integer" }
        },
        required: ["city", "units", "temp", "desc", "icon", "updatedAt", "ttlSec"],
        example: {
            city: "Paris",
            units: "metric",
            temp: 24.7,
            desc: "cloudy",
            icon: "cloud",
            updatedAt: "2025-08-27T18:40:00.000Z",
            ttlSec: 300
        }
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // 8) Audits & Admin
    // ─────────────────────────────────────────────────────────────────────────────
    {
        $id: "AuditItem",
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid", nullable: true },
            deviceId: { type: "string", format: "uuid", nullable: true },
            type: { type: "string" },
            payload: {},
            createdAt: { type: "string", format: "date-time" }
        },
        required: ["id", "type", "createdAt"],
        example: {
            id: "a5f6b3b5-7e4b-4a6e-9a18-0d9a2b2b2a2f",
            userId: "37bfce36-e569-46dd-b6b3-7f3c1b98c668",
            deviceId: "89e81262-2101-4f6a-9969-40b81a18d929",
            type: "DEVICE_PAIRED",
            payload: {},
            createdAt: "2025-08-27T17:45:00.000Z"
        }
    },
    {
        $id: "AdminDeviceItem",
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            ownerId: { type: "string", format: "uuid" },
            disabled: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            pairedAt: { type: "string", format: "date-time", nullable: true }
        },
        required: ["id", "name", "ownerId", "disabled", "createdAt"],
        example: {
            id: "89e81262-2101-4f6a-9969-40b81a18d929",
            name: "Miroir Salon",
            ownerId: "37bfce36-e569-46dd-b6b3-7f3c1b98c668",
            disabled: false,
            createdAt: "2025-08-24T15:37:27.390Z",
            pairedAt: "2025-08-24T16:00:00.000Z"
        }
    },
    {
        $id: "AdminUserItem",
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
            firstName: { type: "string", nullable: true },
            lastName: { type: "string", nullable: true },
            role: { type: "string" },
            createdAt: { type: "string", format: "date-time" }
        },
        required: ["id", "email", "role", "createdAt"],
        example: {
            id: "37bfce36-e569-46dd-b6b3-7f3c1b98c668",
            email: "alice@example.com",
            firstName: "Alice",
            lastName: "Martin",
            role: "admin",
            createdAt: "2025-08-24T14:20:00.000Z"
        }
    },
    {
        $id: "AdminRevokeResponse",
        type: "object",
        properties: {
            device: { $ref: "DeviceSimple#" }
        },
        required: ["device"],
        example: { device: { id: "89e81262-2101-4f6a-9969-40b81a18d929", name: "Miroir Salon" } }
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // 9) Device Snapshot (global)
    // ─────────────────────────────────────────────────────────────────────────────
    {
        $id: "DeviceState",
        type: "object",
        properties: {
            leds: { $ref: "LedState#" },
            music: { $ref: "MusicState#" },
            widgets: { $ref: "WidgetsList#" }
        },
        required: ["leds", "music", "widgets"],
        example: {
            leds: { on: true, color: "#00A3FF", brightness: 42, preset: "ocean" },
            music: { status: "pause", volume: 50, track: null },
            widgets: [
                { key: "clock", enabled: true, orderIndex: 0, config: { format: "24h" } },
                { key: "weather", enabled: true, orderIndex: 1, config: { city: "Paris", units: "metric" } }
            ]
        }
    }
] as const;

const autoSchemas: FastifyPluginAsync = async (app) => {
    for (const s of schemas) {
        try {
            app.addSchema(s as any);
        } catch {
            // ignore si déjà ajouté
        }
    }
};

export default autoSchemas;
