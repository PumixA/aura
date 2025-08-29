// app/(tabs)/_layout.tsx
import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '../../src/store/auth';

export default function TabsLayout() {
    const initialized = useAuth((s) => s.initialized);
    const user = useAuth((s) => s.user);

    if (!initialized) return null;
    if (!user) return <Redirect href="/(auth)/login" />;

    return (
        <Tabs screenOptions={{ headerShown: true }}>
            <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
            <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
        </Tabs>
    );
}
