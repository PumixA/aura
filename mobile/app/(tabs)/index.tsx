// app/(tabs)/index.tsx
import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { useDevices } from '../../src/store/devices';

export default function Home() {
    const items = useDevices((s) => s.items);
    const loading = useDevices((s) => s.loading);
    const error = useDevices((s) => s.error);
    const fetchDevices = useDevices((s) => s.fetchDevices);

    useEffect(() => {
        fetchDevices();
    }, [fetchDevices]);

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
                <Text style={{ color: '#c00' }}>{error}</Text>
            </View>
        );
    }

    if (!items.length) {
        return (
            <View style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Aucun appareil</Text>
                <Text>Tu pourras en ajouter via le scan QR (à venir).</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, padding: 16 }}>
            <FlatList
                data={items}
                keyExtractor={(d) => d.id}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDevices} />}
                renderItem={({ item }) => (
                    <View
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
                        <Text style={{ marginTop: 6, color: '#555' }}>
                            {item.online ? 'En ligne' : 'Hors ligne'}
                            {item.lastSeenAt ? ` • vu: ${new Date(item.lastSeenAt).toLocaleString()}` : ''}
                        </Text>
                    </View>
                )}
            />
        </View>
    );
}
