// app/device/[id].tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Alert, TextInput, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useDeviceState } from '../../src/store/deviceState';
import { useDevices } from '../../src/store/devices';
import type { WidgetItem } from '../../src/store/deviceState';

const SWATCHES = ['#7A5AF8', '#4DA8F0', '#00C2FF', '#FFFFFF'] as const;
const PRESETS = ['ocean', 'sunset', 'forest'] as const;

// Widgets par défaut (conformes au Swagger)
const DEFAULT_WIDGETS: WidgetItem[] = [
    { key: 'clock',   enabled: true,  orderIndex: 0, config: { format: '24h' } },
    { key: 'weather', enabled: true,  orderIndex: 1, config: { city: 'Paris', units: 'metric' } },
    { key: 'music',   enabled: true,  orderIndex: 2, config: {} },
    { key: 'leds',    enabled: true,  orderIndex: 3, config: {} },
];

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

    const widgetsPut = useDeviceState((s) => s.widgetsPut);
    const fetchWeather = useDeviceState((s) => s.fetchWeather);
    const weather = useDeviceState((s) => s.byId[deviceId]?.weather);
    const weatherLoading = useDeviceState((s) => s.byId[deviceId]?.weatherLoading);
    const weatherError = useDeviceState((s) => s.byId[deviceId]?.weatherError);

    const devices = useDevices((s) => s.items);
    const refreshDevices = useDevices((s) => s.fetchDevices);
    const deviceMeta = useMemo(() => devices.find(d => d.id === deviceId), [devices, deviceId]);

    const [renaming, setRenaming] = useState(false);
    const [newName, setNewName] = useState(deviceMeta?.name ?? '');

    // LEDs inputs
    const [colorText, setColorText] = useState(snapshot?.leds.color ?? '#FFFFFF');

    // Widgets local draft
    const [widgetsDraft, setWidgetsDraft] = useState<WidgetItem[]>(snapshot?.widgets ?? []);
    const weatherWidget = useMemo(() => widgetsDraft.find(w => w.key === 'weather'), [widgetsDraft]);
    const [weatherCity, setWeatherCity] = useState(
        (weatherWidget?.config?.city as string) || 'Paris'
    );

    useEffect(() => {
        fetchSnapshot(deviceId);
    }, [deviceId, fetchSnapshot]);

    useEffect(() => {
        if (deviceMeta?.name) setNewName(deviceMeta.name);
    }, [deviceMeta?.name]);

    useEffect(() => {
        if (snapshot?.leds?.color) setColorText(snapshot.leds.color);
    }, [snapshot?.leds?.color]);

    // sync widgets draft when snapshot changes
    useEffect(() => {
        if (snapshot?.widgets) {
            const sorted = [...snapshot.widgets].sort((a,b)=>a.orderIndex-b.orderIndex);
            setWidgetsDraft(sorted);
            const ww = sorted.find(w => w.key === 'weather');
            if (ww?.config?.city) setWeatherCity(String(ww.config.city));
            // auto-fetch weather if enabled
            if (ww?.enabled && (ww?.config?.city as string | undefined)) {
                fetchWeather(String(ww.config.city), 'metric', deviceId);
            }
        }
    }, [snapshot?.widgets, deviceId, fetchWeather]);

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

    // ─── Widgets handlers
    function toggleWidget(key: WidgetItem['key']) {
        const next = widgetsDraft.map(w => w.key === key ? { ...w, enabled: !w.enabled } : w);
        setWidgetsDraft(next);
    }
    function moveWidget(key: WidgetItem['key'], dir: -1 | 1) {
        const arr = [...widgetsDraft].sort((a,b)=>a.orderIndex-b.orderIndex);
        const idx = arr.findIndex(w => w.key === key);
        if (idx < 0) return;
        const tgt = idx + dir;
        if (tgt < 0 || tgt >= arr.length) return;
        // swap orderIndex
        const a = arr[idx], b = arr[tgt];
        const tmp = a.orderIndex;
        a.orderIndex = b.orderIndex;
        b.orderIndex = tmp;
        setWidgetsDraft(arr.slice());
    }
    async function saveWidgets() {
        if (!widgetsDraft.length) {
            Alert.alert('Info', "Ajoute au moins un widget avant d'enregistrer.");
            return;
        }
        try {
            // normalise ordre 0..N
            const normalized = [...widgetsDraft]
                .sort((a,b)=>a.orderIndex-b.orderIndex)
                .map((w, i) => ({ ...w, orderIndex: i }));
            await widgetsPut(deviceId, normalized);
            Alert.alert('OK', 'Widgets enregistrés.');
            // si weather activé → fetch
            const ww = normalized.find(w => w.key === 'weather');
            if (ww?.enabled && ww?.config?.city) {
                fetchWeather(String(ww.config.city), 'metric', deviceId);
            }
        } catch {
            Alert.alert('Erreur', "Échec d'enregistrement des widgets.");
        }
    }
    function updateWeatherCityLocally(city: string) {
        setWeatherCity(city);
        setWidgetsDraft(prev => prev.map(w => w.key === 'weather'
            ? { ...w, config: { ...(w.config ?? {}), city } }
            : w
        ));
    }
    function addDefaultWidgets() {
        setWidgetsDraft(DEFAULT_WIDGETS);
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

                    {/* LEDs */}
                    <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 12 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800' }}>LEDs</Text>

                        <Pressable
                            onPress={handleToggle}
                            style={{
                                height: 42, borderRadius: 999,
                                backgroundColor: snapshot?.leds.on ? '#16a34a' : '#9ca3af',
                                alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <Text style={{ color: 'white', fontWeight: '700' }}>
                                {snapshot?.leds.on ? 'Éteindre' : 'Allumer'}
                            </Text>
                        </Pressable>

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

                        <View>
                            <Text style={{ fontWeight: '600', marginBottom: 6 }}>Presets</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {PRESETS.map((p) => (
                                    <Pressable
                                        key={p}
                                        onPress={() => applyPreset(p)}
                                        style={{
                                            paddingHorizontal: 12, height: 34, borderRadius: 999,
                                            backgroundColor: snapshot?.leds.preset === p ? '#7A5AF8' : '#eef1ff',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        <Text style={{ color: snapshot?.leds.preset === p ? 'white' : '#5a39cf', fontWeight: '600' }}>{p}</Text>
                                    </Pressable>
                                ))}
                                <Pressable
                                    onPress={() => applyPreset(null)}
                                    style={{
                                        paddingHorizontal: 12, height: 34, borderRadius: 999,
                                        backgroundColor: !snapshot?.leds.preset ? '#7A5AF8' : '#eef1ff',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    <Text style={{ color: !snapshot?.leds.preset ? 'white' : '#5a39cf', fontWeight: '600' }}>none</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>

                    {/* Musique */}
                    <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 12 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800' }}>Musique</Text>

                        <Text style={{ color: '#666' }}>
                            Statut : {snapshot?.music.status === 'play' ? 'lecture' : 'pause'} • Volume : {snapshot?.music.volume ?? 0}
                        </Text>

                        <Pressable
                            onPress={togglePlayPause}
                            style={{
                                height: 42, borderRadius: 999,
                                backgroundColor: snapshot?.music.status === 'play' ? '#16a34a' : '#7A5AF8',
                                alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <Text style={{ color: 'white', fontWeight: '700' }}>
                                {snapshot?.music.status === 'play' ? 'Pause' : 'Lecture'}
                            </Text>
                        </Pressable>

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

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                {[0, 50, 100].map(v => (
                                    <Pressable
                                        key={v}
                                        onPress={() => setVolume(v)}
                                        style={{
                                            flex: 1, height: 36, borderRadius: 999,
                                            backgroundColor: (snapshot?.music.volume ?? -1) === v ? '#7A5AF8' : '#eef1ff',
                                            alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >
                                        <Text style={{ color: (snapshot?.music.volume ?? -1) === v ? 'white' : '#5a39cf', fontWeight: '600' }}>{v}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    </View>

                    {/* Widgets & Météo */}
                    <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 12 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800' }}>Widgets</Text>

                        {!widgetsDraft.length ? (
                            <View>
                                <Text style={{ color: '#666', marginBottom: 10 }}>
                                    Aucun widget configuré pour ce miroir.
                                </Text>
                                <Pressable
                                    onPress={addDefaultWidgets}
                                    style={{ height: 44, borderRadius: 12, backgroundColor: '#7A5AF8', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Text style={{ color: 'white', fontWeight: '700' }}>Ajouter les widgets par défaut</Text>
                                </Pressable>
                            </View>
                        ) : (
                            <>
                                {widgetsDraft.map(w => (
                                    <View key={w.key} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Text style={{ fontWeight: '700' }}>{w.key}</Text>
                                            <Text style={{ color: '#666' }}>#{w.orderIndex}</Text>
                                        </View>

                                        {/* Actions: toggle + ordre */}
                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                                            <Pressable
                                                onPress={() => toggleWidget(w.key as any)}
                                                style={{ flex: 1, height: 36, borderRadius: 999, backgroundColor: w.enabled ? '#16a34a' : '#9ca3af', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                <Text style={{ color: 'white', fontWeight: '700' }}>{w.enabled ? 'Activé' : 'Désactivé'}</Text>
                                            </Pressable>
                                            <Pressable
                                                onPress={() => moveWidget(w.key as any, -1)}
                                                style={{ width: 48, height: 36, borderRadius: 8, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                <Text style={{ fontWeight: '800' }}>↑</Text>
                                            </Pressable>
                                            <Pressable
                                                onPress={() => moveWidget(w.key as any, +1)}
                                                style={{ width: 48, height: 36, borderRadius: 8, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                <Text style={{ fontWeight: '800' }}>↓</Text>
                                            </Pressable>
                                        </View>

                                        {/* Config spécifique: weather.city */}
                                        {w.key === 'weather' && (
                                            <View style={{ marginTop: 8 }}>
                                                <Text style={{ fontWeight: '600', marginBottom: 6 }}>Ville (météo)</Text>
                                                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                                    <View style={{ flex: 1, backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 12 }}>
                                                        <TextInput
                                                            value={weatherCity}
                                                            onChangeText={updateWeatherCityLocally}
                                                            placeholder="Paris"
                                                            style={{ height: 44 }}
                                                        />
                                                    </View>
                                                    <Pressable
                                                        onPress={() => fetchWeather(weatherCity, 'metric', deviceId)}
                                                        style={{ height: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#eef1ff', alignItems: 'center', justifyContent: 'center' }}
                                                    >
                                                        <Text style={{ color: '#5a39cf', fontWeight: '700' }}>Tester</Text>
                                                    </Pressable>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                ))}

                                <Pressable
                                    onPress={saveWidgets}
                                    style={{ marginTop: 12, height: 44, borderRadius: 12, backgroundColor: '#7A5AF8', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Text style={{ color: 'white', fontWeight: '700' }}>Enregistrer les widgets</Text>
                                </Pressable>
                            </>
                        )}

                        {/* Bloc météo (si activé) */}
                        {widgetsDraft.find(w => w.key === 'weather' && w.enabled) && (
                            <View style={{ marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: 'rgba(125, 95, 245, 0.08)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
                                <Text style={{ fontWeight: '800' }}>Météo — {weatherCity}</Text>
                                {weatherLoading ? (
                                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 }}>
                                        <ActivityIndicator />
                                        <Text>Chargement…</Text>
                                    </View>
                                ) : weatherError ? (
                                    <Text style={{ marginTop: 6, color: '#c00' }}>{weatherError}</Text>
                                ) : weather ? (
                                    <View style={{ marginTop: 6 }}>
                                        <Text style={{ fontSize: 28, fontWeight: '800' }}>{Math.round(weather.temp)}°</Text>
                                        <Text style={{ color: '#555' }}>{weather.desc}</Text>
                                        <Text style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
                                            MAJ {new Date(weather.updatedAt).toLocaleTimeString()} • TTL {weather.ttlSec}s
                                        </Text>
                                    </View>
                                ) : (
                                    <Text style={{ marginTop: 6, color: '#666' }}>Aucune donnée.</Text>
                                )}
                            </View>
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
