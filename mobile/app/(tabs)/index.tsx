// app/(tabs)/index.tsx
import React, { useEffect, useMemo } from 'react';
import { View, Text, ActivityIndicator, FlatList, RefreshControl, Pressable } from 'react-native';
import { useDevices } from '../../src/store/devices';
import { useRouter } from 'expo-router';

function formatAgo(iso?: string | null): string {
    if (!iso) return 'jamais';
    const t = new Date(iso).getTime();
    const now = Date.now();
    const sec = Math.max(0, Math.floor((now - t) / 1000));
    if (sec < 5) return 'à l’instant';
    if (sec < 60) return `il y a ${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    return `il y a ${h} h`;
}

export default function Home() {
    const router = useRouter();
    const items = useDevices((s) => s.items);
    const loading = useDevices((s) => s.loading);
    const error = useDevices((s) => s.error);
    const fetchDevices = useDevices((s) => s.fetchDevices);

    useEffect(() => {
        fetchDevices();
    }, [fetchDevices]);

    const AddButton = (
        <Pressable
            onPress={() => router.push('/pair-qr')}
            style={{
                height: 44,
                borderRadius: 12,
                backgroundColor: '#7A5AF8',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 16,
                marginBottom: 12,
            }}
        >
            <Text style={{ color: 'white', fontWeight: '700' }}>Ajouter un appareil</Text>
        </Pressable>
    );

    if (loading && !items.length) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator />
                <Text style={{ marginTop: 8 }}>Chargement des appareils…</Text>
            </View>
        );
    }

    if (error && !items.length) {
        return (
            <View style={{ flex: 1, padding: 20 }}>
                {AddButton}
                <Text style={{ color: '#c00' }}>{error}</Text>
            </View>
        );
    }

    if (!items.length) {
        return (
            <View style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' }}>
                {AddButton}
                <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Aucun appareil</Text>
                <Text>Colle un lien ou saisis le Device ID et le Token.</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, padding: 16 }}>
            {AddButton}
            <FlatList
                data={items}
                keyExtractor={(d) => d.id}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDevices} />}
                renderItem={({ item }) => {
                    const statusText = item.online
                        ? 'En ligne'
                        : `Hors ligne • vu ${formatAgo(item.lastSeenAt)}`;
                    const statusColor = item.online ? '#166534' : '#991b1b';
                    const badgeBg = item.online ? '#e8f7ed' : '#fde8e8';
                    return (
                        <Pressable
                            onPress={() => router.push(`/device/${item.id}`)}
                            style={{
                                padding: 16,
                                borderRadius: 16,
                                backgroundColor: 'rgba(255,255,255,0.95)',
                                marginBottom: 12,
                                borderWidth: 1,
                                borderColor: 'rgba(0,0,0,0.06)',
                            }}
                        >
                            <Text style={{ fontSize: 16, fontWeight: '700' }}>{item.name}</Text>
                            <View
                                style={{
                                    marginTop: 6,
                                    alignSelf: 'flex-start',
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                    borderRadius: 999,
                                    backgroundColor: badgeBg,
                                }}
                            >
                                <Text style={{ color: statusColor, fontWeight: '700' }}>{statusText}</Text>
                            </View>
                        </Pressable>
                    );
                }}
            />
        </View>
    );
}
