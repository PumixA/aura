import { Stack } from 'expo-router'
import { useEffect } from 'react'
import { useAuth } from '../src/store/auth'

export default function RootLayout() {
    const hydrate = useAuth((s) => s.hydrate)

    useEffect(() => {
        hydrate()
    }, [])

    return (
        <Stack screenOptions={{ headerShown: false }} />
    )
}
