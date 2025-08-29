// app/(tabs)/profile.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAuth } from '../../src/store/auth';
import { useRouter } from 'expo-router';

export default function Profile() {
    const user = useAuth((s) => s.user);
    const logout = useAuth((s) => s.logout);
    const router = useRouter();

    async function onLogout() {
        await logout();
        router.replace('/(auth)/login');
    }

    return (
        <View style={{ flex: 1, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 22, fontWeight: '800' }}>Mon compte</Text>
            <Text style={{ marginTop: 8 }}>Email : {user?.email}</Text>
            <Text>Nom : {user?.lastName ?? '—'}</Text>
            <Text>Prénom : {user?.firstName ?? '—'}</Text>

            <View style={{ height: 16 }} />
            <Pressable
                onPress={onLogout}
                style={{ height: 52, borderRadius: 999, backgroundColor: '#7A5AF8', alignItems: 'center', justifyContent: 'center', marginTop: 12 }}
            >
                <Text style={{ color: 'white', fontWeight: '700' }}>Se déconnecter</Text>
            </Pressable>
        </View>
    );
}
