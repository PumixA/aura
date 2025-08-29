// app/index.tsx
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { api } from '../src/api/client';
import { API_BASE } from '../src/lib/env';

export default function Index() {
    const [health, setHealth] = useState<string>('...');

    useEffect(() => {
        api
            .get('/health')
            .then((r) => setHealth(JSON.stringify(r.data)))
            .catch(() => setHealth('offline'));
    }, []);

    return (
        <View style={{ flex: 1, backgroundColor: '#0B0E15', padding: 20, justifyContent: 'center' }}>
            <Text style={{ color: '#ECEEF7', fontWeight: '800', fontSize: 18, marginBottom: 8 }}>
                Aura • Jalon A
            </Text>
            <Text style={{ color: '#ECEEF7', marginBottom: 4 }}>API_BASE: {API_BASE}</Text>
            <Text style={{ color: '#ECEEF7', marginBottom: 4 }}>health: {health}</Text>
            <Text style={{ color: '#7A5AF8' }}>
                (version minimale — aucun composant custom importé)
            </Text>
        </View>
    );
}
