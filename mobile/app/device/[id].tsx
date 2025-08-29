// app/device/[id].tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Alert, TextInput, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useDeviceState } from '../../src/store/deviceState';
import { useDevices } from '../../src/store/devices';

export default function DeviceDetail() {
    const router = useRouter();
    const params = useLocalSearchParams<{ id: string }>();
    const deviceId = String(params.id);

    const snapshot = useDeviceState((s) => s.byId[deviceId]?.data);
    const loading = useDeviceState((s) => s.byId[deviceId]?.loading) ?? false;
    const error = useDeviceState((s) => s.byId[deviceId]?.error);
    const fetchSnapshot = useDeviceState((s) => s.fetchSnapshot);
    const renameDevice = useDeviceState((s) => s.renameDevice);
    const deleteDevice = useDeviceState((s) => s.deleteDevice);

    const devices = useDevices((s) => s.items);
    const refreshDevices = useDevices((s) => s.fetchDevices);
    const deviceMeta = useMemo(() => devices.find(d => d.id === deviceId), [devices, deviceId]);

    // UI local pour rename inline
    const [renaming, setRenaming] = useState(false);
    const [newName, setNewName] = useState(deviceMeta?.name ?? '');

    useEffect(() => {
        fetchSnapshot(deviceId);
    }, [deviceId, fetchSnapshot]);

    useEffect(() => {
        if (deviceMeta?.name) setNewName(deviceMeta.name);
    }, [deviceMeta?.name]);

    async function onConfirmRename() {
        const name = newName.trim();
        if (!name) return;
        try {
            await renameDevice(deviceId, name);
            await refreshDevices();
            setRenaming(false);
        } catch {
            Alert.alert('Erreur', "Impossible de renommer l'appareil.");
        }
    }

    async function onDelete() {
        Alert.alert(
            'Dissocier le miroir',
            'Cette action est définitive. Continuer ?',
            [
                { text: 'Annuler', style: 'cancel' },
                {
                    text: 'Dissocier',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteDevice(deviceId);
                            await refreshDevices();
                            router.back();
                        } catch {
                            Alert.alert('Erreur', "Impossible de dissocier l'appareil.");
                        }
                    }
                }
            ]
        );
    }

    const Title = deviceMeta?.name ?? 'Appareil';

    return (
        <View style={{ flex: 1 }}>
            <Stack.Screen options={{ title: Title, headerShown: true }} />

            {loading && !snapshot ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator />
                    <Text style={{ marginTop: 8 }}>Chargement du snapshot…</Text>
                </View>
            ) : error ? (
                <View style={{ flex: 1, padding: 20 }}>
                    <Text style={{ color: '#c00' }}>{error}</Text>
                    <Pressable
                        onPress={() => fetchSnapshot(deviceId)}
                        style={{ marginTop: 12, height: 44, borderRadius: 12, backgroundColor: '#eef1ff', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Text style={{ color: '#5a39cf', fontWeight: '600' }}>Réessayer</Text>
                    </Pressable>
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
                    {/* Header gestion */}
                    <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
                        {!renaming ? (
                            <>
                                <Text style={{ fontSize: 18, fontWeight: '800' }}>{deviceMeta?.name ?? 'Appareil'}</Text>
                                <Text style={{ marginTop: 6, color: '#666' }}>
                                    Statut : {deviceMeta?.disabled ? 'Désactivé' : 'Inconnu (agent non connecté)'}
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                                    <Pressable
                                        onPress={() => setRenaming(true)}
                                        style={{ height: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#eef1ff', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <Text style={{ color: '#5a39cf', fontWeight: '600' }}>Renommer</Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={onDelete}
                                        style={{ height: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#ffe9ea', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <Text style={{ color: '#a1272c', fontWeight: '700' }}>Dissocier</Text>
                                    </Pressable>
                                </View>
                            </>
                        ) : (
                            <>
                                <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Nouveau nom</Text>
                                <View style={{ backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 12 }}>
                                    <TextInput value={newName} onChangeText={setNewName} style={{ height: 44 }} />
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                                    <Pressable
                                        onPress={onConfirmRename}
                                        style={{ height: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#7A5AF8', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <Text style={{ color: 'white', fontWeight: '700' }}>Enregistrer</Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={() => setRenaming(false)}
                                        style={{ height: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <Text style={{ color: '#333', fontWeight: '600' }}>Annuler</Text>
                                    </Pressable>
                                </View>
                            </>
                        )}
                    </View>

                    {/* LEDs */}
                    <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
                        <Text style={{ fontSize: 16, fontWeight: '800' }}>LEDs</Text>
                        {snapshot ? (
                            <>
                                <Text style={{ marginTop: 8 }}>État : {snapshot.leds.on ? 'allumées' : 'éteintes'}</Text>
                                <Text>Couleur : {snapshot.leds.color}</Text>
                                <Text>Luminosité : {snapshot.leds.brightness}%</Text>
                                <Text>Preset : {snapshot.leds.preset ?? '—'}</Text>
                            </>
                        ) : (
                            <Text style={{ marginTop: 8, color: '#666' }}>—</Text>
                        )}
                    </View>

                    {/* Musique */}
                    <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
                        <Text style={{ fontSize: 16, fontWeight: '800' }}>Musique</Text>
                        {snapshot ? (
                            <>
                                <Text style={{ marginTop: 8 }}>Statut : {snapshot.music.status === 'play' ? 'lecture' : 'pause'}</Text>
                                <Text>Volume : {snapshot.music.volume}</Text>
                            </>
                        ) : (
                            <Text style={{ marginTop: 8, color: '#666' }}>—</Text>
                        )}
                    </View>

                    {/* Widgets */}
                    <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
                        <Text style={{ fontSize: 16, fontWeight: '800' }}>Widgets</Text>
                        {snapshot && snapshot.widgets?.length ? (
                            <View style={{ marginTop: 8 }}>
                                {snapshot.widgets.map(w => (
                                    <View key={w.key} style={{ paddingVertical: 6 }}>
                                        <Text>{w.key} — {w.enabled ? 'on' : 'off'} (#{w.orderIndex})</Text>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <Text style={{ marginTop: 8, color: '#666' }}>Aucun widget</Text>
                        )}
                    </View>

                    {/* Actions bas de page */}
                    <Pressable
                        onPress={() => fetchSnapshot(deviceId)}
                        style={{ height: 44, borderRadius: 12, backgroundColor: '#eef1ff', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Text style={{ color: '#5a39cf', fontWeight: '600' }}>Rafraîchir le snapshot</Text>
                    </Pressable>
                </ScrollView>
            )}
        </View>
    );
}
