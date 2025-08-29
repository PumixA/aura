// app/device/[id].tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Alert, TextInput, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useDeviceState } from '../../src/store/deviceState';
import { useDevices } from '../../src/store/devices';

const SWATCHES = ['#7A5AF8', '#4DA8F0', '#00C2FF', '#FFFFFF'] as const;
const PRESETS = ['ocean', 'sunset', 'forest'] as const;

function isHex(value: string) {
    return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

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

    const ledsToggle = useDeviceState((s) => s.ledsToggle);
    const ledsStyle = useDeviceState((s) => s.ledsStyle);

    const musicCmd = useDeviceState((s) => s.musicCmd);
    const musicSetVolume = useDeviceState((s) => s.musicSetVolume);

    const devices = useDevices((s) => s.items);
    const refreshDevices = useDevices((s) => s.fetchDevices);
    const deviceMeta = useMemo(() => devices.find(d => d.id === deviceId), [devices, deviceId]);

    const [renaming, setRenaming] = useState(false);
    const [newName, setNewName] = useState(deviceMeta?.name ?? '');

    // Local UI state pour inputs LEDs
    const [colorText, setColorText] = useState(snapshot?.leds.color ?? '#FFFFFF');

    useEffect(() => {
        fetchSnapshot(deviceId);
    }, [deviceId, fetchSnapshot]);

    useEffect(() => {
        if (deviceMeta?.name) setNewName(deviceMeta.name);
    }, [deviceMeta?.name]);

    useEffect(() => {
        if (snapshot?.leds?.color) setColorText(snapshot.leds.color);
    }, [snapshot?.leds?.color]);

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

    // ─── LEDs handlers
    async function handleToggle() {
        try {
            await ledsToggle(deviceId, !snapshot?.leds.on);
        } catch {
            Alert.alert('Erreur', "Échec de la commande on/off.");
        }
    }

    async function handleApplyColor() {
        const v = colorText.trim();
        if (!isHex(v)) {
            Alert.alert('Couleur invalide', 'Utilise un hex du type #RRGGBB.');
            return;
        }
        try {
            await ledsStyle(deviceId, { color: v, preset: null }); // preset retiré si couleur directe
        } catch {
            Alert.alert('Erreur', "Impossible d'appliquer la couleur.");
        }
    }

    async function handleSwatch(c: string) {
        setColorText(c);
        try {
            await ledsStyle(deviceId, { color: c, preset: null });
        } catch {
            Alert.alert('Erreur', "Impossible d'appliquer la couleur.");
        }
    }

    async function changeBrightness(delta: number) {
        if (!snapshot) return;
        const next = Math.max(0, Math.min(100, snapshot.leds.brightness + delta));
        try {
            await ledsStyle(deviceId, { brightness: next });
        } catch {
            Alert.alert('Erreur', "Impossible de modifier la luminosité.");
        }
    }

    async function applyPreset(p: string | null) {
        try {
            await ledsStyle(deviceId, { preset: p });
        } catch {
            Alert.alert('Erreur', "Impossible d'appliquer le preset.");
        }
    }

    // ─── Music handlers
    async function togglePlayPause() {
        if (!snapshot) return;
        const next = snapshot.music.status === 'play' ? 'pause' : 'play';
        try {
            await musicCmd(deviceId, next);
        } catch {
            Alert.alert('Erreur', 'Commande play/pause échouée.');
        }
    }
    async function nextTrack() {
        try {
            await musicCmd(deviceId, 'next');
        } catch {
            Alert.alert('Erreur', 'Commande next échouée.');
        }
    }
    async function prevTrack() {
        try {
            await musicCmd(deviceId, 'prev');
        } catch {
            Alert.alert('Erreur', 'Commande prev échouée.');
        }
    }
    async function changeVolume(delta: number) {
        if (!snapshot) return;
        const next = Math.max(0, Math.min(100, snapshot.music.volume + delta));
        try {
            await musicSetVolume(deviceId, next);
        } catch {
            Alert.alert('Erreur', 'Changement de volume échoué.');
        }
    }
    async function setVolume(v: number) {
        try {
            await musicSetVolume(deviceId, v);
        } catch {
            Alert.alert('Erreur', 'Changement de volume échoué.');
        }
    }

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

                    {/* LEDs (contrôles réels) */}
                    <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 12 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800' }}>LEDs</Text>

                        {/* On / Off */}
                        <Pressable
                            onPress={handleToggle}
                            style={{
                                height: 42,
                                borderRadius: 999,
                                backgroundColor: snapshot?.leds.on ? '#16a34a' : '#9ca3af',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Text style={{ color: 'white', fontWeight: '700' }}>
                                {snapshot?.leds.on ? 'Éteindre' : 'Allumer'}
                            </Text>
                        </Pressable>

                        {/* Couleur hex */}
                        <View>
                            <Text style={{ fontWeight: '600', marginBottom: 6 }}>Couleur (#RRGGBB)</Text>
                            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                <View style={{ flex: 1, backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 12 }}>
                                    <TextInput
                                        placeholder="#00C2FF"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        value={colorText}
                                        onChangeText={setColorText}
                                        style={{ height: 44 }}
                                    />
                                </View>
                                <Pressable
                                    onPress={handleApplyColor}
                                    style={{ height: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#7A5AF8', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Text style={{ color: 'white', fontWeight: '700' }}>Appliquer</Text>
                                </Pressable>
                            </View>

                            {/* Swatches rapides */}
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                {SWATCHES.map((c) => (
                                    <Pressable
                                        key={c}
                                        onPress={() => handleSwatch(c)}
                                        style={{
                                            width: 36, height: 36, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', backgroundColor: c,
                                        }}
                                    />
                                ))}
                            </View>
                        </View>

                        {/* Luminosité */}
                        <View>
                            <Text style={{ fontWeight: '600', marginBottom: 6 }}>Luminosité: {snapshot?.leds.brightness ?? 0}%</Text>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <Pressable
                                    onPress={() => changeBrightness(-5)}
                                    style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Text style={{ fontWeight: '700' }}>−</Text>
                                </Pressable>
                                <Pressable
                                    onPress={() => changeBrightness(+5)}
                                    style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Text style={{ fontWeight: '700' }}>+</Text>
                                </Pressable>
                            </View>
                        </View>

                        {/* Presets */}
                        <View>
                            <Text style={{ fontWeight: '600', marginBottom: 6 }}>Presets</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {PRESETS.map((p) => (
                                    <Pressable
                                        key={p}
                                        onPress={() => applyPreset(p)}
                                        style={{
                                            paddingHorizontal: 12, height: 34, borderRadius: 999, backgroundColor: snapshot?.leds.preset === p ? '#7A5AF8' : '#eef1ff',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        <Text style={{ color: snapshot?.leds.preset === p ? 'white' : '#5a39cf', fontWeight: '600' }}>{p}</Text>
                                    </Pressable>
                                ))}
                                <Pressable
                                    onPress={() => applyPreset(null)}
                                    style={{
                                        paddingHorizontal: 12, height: 34, borderRadius: 999, backgroundColor: !snapshot?.leds.preset ? '#7A5AF8' : '#eef1ff',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    <Text style={{ color: !snapshot?.leds.preset ? 'white' : '#5a39cf', fontWeight: '600' }}>none</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>

                    {/* Musique (contrôles réels) */}
                    <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 12 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800' }}>Musique</Text>

                        <Text style={{ color: '#666' }}>
                            Statut : {snapshot?.music.status === 'play' ? 'lecture' : 'pause'} • Volume : {snapshot?.music.volume ?? 0}
                        </Text>

                        {/* Play / Pause */}
                        <Pressable
                            onPress={togglePlayPause}
                            style={{
                                height: 42,
                                borderRadius: 999,
                                backgroundColor: snapshot?.music.status === 'play' ? '#16a34a' : '#7A5AF8',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Text style={{ color: 'white', fontWeight: '700' }}>
                                {snapshot?.music.status === 'play' ? 'Pause' : 'Lecture'}
                            </Text>
                        </Pressable>

                        {/* Prev / Next */}
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Pressable
                                onPress={prevTrack}
                                style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <Text style={{ fontWeight: '700' }}>{'⟨⟨'} Prev</Text>
                            </Pressable>
                            <Pressable
                                onPress={nextTrack}
                                style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <Text style={{ fontWeight: '700' }}>Next {'⟩⟩'}</Text>
                            </Pressable>
                        </View>

                        {/* Volume */}
                        <View>
                            <Text style={{ fontWeight: '600', marginBottom: 6 }}>Volume</Text>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <Pressable
                                    onPress={() => changeVolume(-5)}
                                    style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Text style={{ fontWeight: '700' }}>−</Text>
                                </Pressable>
                                <Pressable
                                    onPress={() => changeVolume(+5)}
                                    style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Text style={{ fontWeight: '700' }}>+</Text>
                                </Pressable>
                            </View>

                            {/* Shortcuts 0 / 50 / 100 */}
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                {[0, 50, 100].map(v => (
                                    <Pressable
                                        key={v}
                                        onPress={() => setVolume(v)}
                                        style={{
                                            flex: 1,
                                            height: 36,
                                            borderRadius: 999,
                                            backgroundColor: (snapshot?.music.volume ?? -1) === v ? '#7A5AF8' : '#eef1ff',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <Text style={{ color: (snapshot?.music.volume ?? -1) === v ? 'white' : '#5a39cf', fontWeight: '600' }}>{v}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    </View>

                    {/* Widgets (lecture seule) */}
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
