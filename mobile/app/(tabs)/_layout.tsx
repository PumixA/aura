import { Tabs } from 'expo-router'

export default function TabsLayout() {
    return (
        <Tabs screenOptions={{ headerStyle: { backgroundColor: '#0b0f14' }, headerTintColor: 'white' }}>
            <Tabs.Screen name="index" options={{ title: 'Mes appareils' }} />
            <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
        </Tabs>
    )
}
