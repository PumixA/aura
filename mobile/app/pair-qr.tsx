// app/pair-qr.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../src/api/client';
import { useDevices } from '../src/store/devices';

function parseLink(input: string): { deviceId?: string; token?: string } {
    try {
        // supporte aura://pair?deviceId=...&token=... ou https://.../pair?deviceId=...&token=...
        const u = new URL(input);
        const deviceId = u.searchParams.get('deviceId') ?? undefined;
        const token = u.searchParams.get('token') ?? u.searchParams.get('pairingToken') ?? undefined;
        return { deviceId, token };
    } catch {
        return {};
    }
}

export default function PairQR() {
    const router = useRouter();
    const fetchDevices = useDevices((s) => s.fetchDevices);

    const [deviceId, setDeviceId] = useState('');
    const [token, setToken] = useState('');
    const [link, setLink] = useState('');
    const [loading, setLoading] = useState(false);

    function onParseLink() {
        const { deviceId: d, token: t } = parseLink(link.trim());
        if (d) setDeviceId(d);
        if (t) setToken(t);
        if (!d && !t) {
            Alert.alert('Lien invalide', "Je n'ai pas trouvé deviceId/token dans ce lien.");
        }
    }

    async function onSubmit() {
        if (!deviceId || !token) {
            Alert.alert('Champs manquants', 'Renseigne Device ID et Token.');
            return;
        }
        setLoading(true);
        try {
            await api.post('/devices/pair', { deviceId, pairingToken: token });
            Alert.alert('Succès', 'Appareil appairé !');
            await fetchDevices();
            router.back(); // retour vers Home
        } catch (e: any) {
            const status = e?.response?.status;
            if (status === 400) Alert.alert('Aucun token actif', "Le miroir n'a pas de token actif.");
            else if (status === 401) Alert.alert('Token invalide', 'Le token saisi est incorrect.');
            else if (status === 409) Alert.alert('Conflit', "Appareil déjà appairé ou désactivé.");
            else if (status === 410) Alert.alert('Expiré', 'Le token est expiré, régénère-le sur le miroir.');
            else Alert.alert('Erreur', "Impossible d'appairer l'appareil.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <View style={{ flex: 1, padding: 20, gap: 14 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 6 }}>Ajouter un appareil</Text>

            <Text style={{ opacity: 0.7, marginBottom: 4 }}>Coller un lien (facultatif)</Text>
            <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 12 }}>
                <TextInput
                    placeholder="aura://pair?deviceId=...&token=123456"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={link}
                    onChangeText={setLink}
                    style={{ height: 48 }}
                />
            </View>
            <Pressable
                onPress={onParseLink}
                style={{ height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef1ff' }}
            >
                <Text style={{ color: '#5a39cf', fontWeight: '600' }}>Analyser le lien</Text>
            </Pressable>

            <Text style={{ opacity: 0.7, marginTop: 8 }}>Ou saisis les infos manuellement</Text>

            <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 12 }}>
                <TextInput
                    placeholder="Device ID (uuid)"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={deviceId}
                    onChangeText={setDeviceId}
                    style={{ height: 48 }}
                />
            </View>

            <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 12 }}>
                <TextInput
                    placeholder="Token"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={token}
                    onChangeText={setToken}
                    style={{ height: 48 }}
                />
            </View>

            <Pressable
                onPress={onSubmit}
                disabled={loading}
                style={{
                    height: 52,
                    borderRadius: 999,
                    backgroundColor: '#7A5AF8',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: loading ? 0.7 : 1,
                    marginTop: 12,
                }}
            >
                <Text style={{ color: 'white', fontWeight: '700' }}>{loading ? 'Appairage…' : "Appairer l'appareil"}</Text>
            </Pressable>
        </View>
    );
}
