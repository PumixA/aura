import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL

export const api = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
})

async function getAccessToken() {
    return await SecureStore.getItemAsync('access_token')
}

async function getRefreshToken() {
    return await SecureStore.getItemAsync('refresh_token')
}

api.interceptors.request.use(async (config) => {
    const token = await getAccessToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

let isRefreshing = false
let queue: Array<(t: string | null) => void> = []

api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config
        if (error.response?.status === 401 && !original._retry) {
            original._retry = true
            if (!isRefreshing) {
                isRefreshing = true
                try {
                    const rt = await getRefreshToken()
                    if (!rt) throw new Error('No refresh token')
                    const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken: rt })
                    await SecureStore.setItemAsync('access_token', data.accessToken)
                    queue.forEach((cb) => cb(data.accessToken))
                } catch (e) {
                    queue.forEach((cb) => cb(null))
                } finally {
                    queue = []
                    isRefreshing = false
                }
            }
            return new Promise((resolve, reject) => {
                queue.push(async (newToken) => {
                    if (newToken) {
                        original.headers.Authorization = `Bearer ${newToken}`
                        resolve(api.request(original))
                    } else {
                        reject(error)
                    }
                })
            })
        }
        return Promise.reject(error)
    }
)
