import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    Pressable,
    Alert,
    TextInput,
    ScrollView,
    Modal,
    RefreshControl,
    PanResponder,
    LayoutChangeEvent,
    StyleSheet,
    Dimensions,
    Platform,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDeviceState } from '../../src/store/deviceState';
import { useDevices } from '../../src/store/devices';
import type { WidgetItem } from '../../src/store/deviceState';

import { GlassCard, PrimaryButton } from '../../components/ui';
import { Colors } from '../../constants/Colors';

const { width: W, height: H } = Dimensions.get('window');
const HEADER_HEIGHT = Platform.select({ ios: 52, android: 56, default: 56 });

const SWATCHES = [
    '#FFFFFF', '#FDE68A', '#FCA5A5', '#FDBA74',
    '#7A5AF8', '#4DA8F0', '#00C2FF', '#34D399',
    '#60A5FA', '#A78BFA', '#F472B6', '#111827',
] as const;
const PRESETS = ['ocean', 'sunset', 'forest'] as const;

const DEFAULT_WIDGETS: WidgetItem[] = [
    { key: 'clock',   enabled: true, orderIndex: 0, config: { format: '24h' } },
    { key: 'weather', enabled: true, orderIndex: 1, config: { city: 'Paris', units: 'metric' } },
    { key: 'music',   enabled: true, orderIndex: 2, config: {} },
    { key: 'leds',    enabled: true, orderIndex: 3, config: {} },
];

function isHex(value: string) { return /^#[0-9A-Fa-f]{6}$/.test(value.trim()); }
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


function GhostButton({ label, onPress, style }: { label: string; onPress?: () => void; style?: any }) {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                {
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.22)',
                    backgroundColor: pressed ? 'rgba(15,16,24,0.22)' : 'rgba(15,16,24,0.16)',
                    alignItems: 'center',
                    justifyContent: 'center',
                },
                style,
            ]}
        >
            <Text style={{ fontWeight: '900', color: '#fff' }}>{label}</Text>
        </Pressable>
    );
}

function PillButton({
                        label, onPress, active, style,
                    }: { label: string; onPress?: () => void; active?: boolean; style?: any }) {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                {
                    paddingVertical: 12,
                    paddingHorizontal: 18,
                    borderRadius: 999,
                    backgroundColor: active ? Colors.primary.solid : 'rgba(255,255,255,0.10)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.22)',
                    opacity: pressed ? 0.94 : 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                },
                style,
            ]}
        >
            <Text style={{ fontWeight: '800', color: '#fff' }}>{label}</Text>
        </Pressable>
    );
}

function IconTile({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
    return (
        <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.96 : 1, flex: 1 }]}>
            <GlassCard padding={18} style={{ alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 26 }}>{emoji}</Text>
                <Text style={{ fontWeight: '800', color: '#fff' }}>{label}</Text>
            </GlassCard>
        </Pressable>
    );
}

function HeaderTitle({ name, online }: { name?: string; online?: boolean }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 240 }}>
            <View
                style={{
                    width: 10, height: 10, borderRadius: 999,
                    backgroundColor: online ? Colors.status.onlineText : Colors.status.offlineText,
                }}
            />
            <Text numberOfLines={1} style={{ fontWeight: '900', fontSize: 16, color: '#fff' }}>
                {name ?? 'Appareil'}
            </Text>
        </View>
    );
}

function KebabMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
    const [open, setOpen] = useState(false);
    const insets = useSafeAreaInsets();

    return (
        <>
            <Pressable onPress={() => setOpen(true)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                <Ionicons name="ellipsis-vertical" size={18} color="#fff" />
            </Pressable>

            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <View style={styles.modalBackdrop}>
                    <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />
                    <View style={[styles.sheetWrap, { paddingBottom: insets.bottom + 12 }]}>
                        <GlassCard padding={16} intensity={40} overlayOpacity={0.28} style={{ gap: 12 }}>
                            <PrimaryButton
                                label="Renommer"
                                onPress={() => {
                                    setOpen(false);
                                    requestAnimationFrame(onRename);
                                }}
                            />
                            <Pressable
                                onPress={() => {
                                    setOpen(false);
                                    requestAnimationFrame(onDelete);
                                }}
                                style={({ pressed }) => [
                                    {
                                        borderRadius: 14,
                                        paddingVertical: 12,
                                        alignItems: 'center',
                                        backgroundColor: pressed ? 'rgba(255,82,82,0.20)' : 'rgba(255,82,82,0.14)',
                                        borderWidth: 1,
                                        borderColor: 'rgba(255,255,255,0.22)',
                                    },
                                ]}
                            >
                                <Text style={{ color: '#fff', fontWeight: '900' }}>Dissocier</Text>
                            </Pressable>

                            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 2 }} />

                            <GhostButton label="Fermer" onPress={() => setOpen(false)} style={{ alignSelf: 'stretch' }} />
                        </GlassCard>
                    </View>
                </View>
            </Modal>
        </>
    );
}

function Sheet({
                   visible, onClose, title, children,
               }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalBackdrop}>
                <Pressable style={{ flex: 1 }} onPress={onClose} />
                <View style={[styles.sheetWrap, { paddingBottom: insets.bottom + 12 }]}>
                    <GlassCard padding={16} intensity={42} overlayOpacity={0.30} style={{ gap: 14 }}>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>{title}</Text>
                        {children}
                        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
                        <GhostButton label="Fermer" onPress={onClose} style={{ alignSelf: 'stretch' }} />
                    </GlassCard>
                </View>
            </View>
        </Modal>
    );
}

export default function DeviceDetail() {
    const router = useRouter();
    const navigation = useNavigation();
    const params = useLocalSearchParams<{ id: string }>();
    const deviceId = String(params.id);
    const insets = useSafeAreaInsets();

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
    const deviceMeta = useMemo(() => devices.find((d) => d.id === deviceId), [devices, deviceId]);

    const [renaming, setRenaming] = useState(false);
    const [newName, setNewName] = useState(deviceMeta?.name ?? '');
    const [refreshing, setRefreshing] = useState(false);

    const [openLEDs, setOpenLEDs] = useState(false);
    const [openMusic, setOpenMusic] = useState(false);
    const [openWidgets, setOpenWidgets] = useState(false);

    const [colorText, setColorText] = useState(snapshot?.leds.color ?? '#FFFFFF');
    const [brightnessDraft, setBrightnessDraft] = useState<number>(snapshot?.leds.brightness ?? 50);

    const [widgetsDraft, setWidgetsDraft] = useState<WidgetItem[]>(snapshot?.widgets ?? []);
    const [itemHeight, setItemHeight] = useState(64);
    const dragIndexRef = useRef<number | null>(null);
    const startYRef = useRef(0);

    const weatherWidget = useMemo(() => widgetsDraft.find((w) => w.key === 'weather'), [widgetsDraft]);
    const [weatherCity, setWeatherCity] = useState((weatherWidget?.config?.city as string) || 'Paris');

    useEffect(() => {
        let mounted = true;
        (async () => {
            await fetchSnapshot(deviceId);
            await refreshDevices();
            if (mounted) useDeviceState.getState().openSocket(deviceId);
        })();
        return () => {
            mounted = false;
            useDeviceState.getState().closeSocket(deviceId);
        };
    }, [deviceId, fetchSnapshot, refreshDevices]);

    useEffect(() => {
        const id = setInterval(() => { refreshDevices().catch(() => {}); }, 15000);
        return () => clearInterval(id);
    }, [refreshDevices]);

    useEffect(() => {
        if (deviceMeta?.name) setNewName(deviceMeta.name);
    }, [deviceMeta?.name]);

    useEffect(() => {
        if (snapshot?.leds?.color) setColorText(snapshot.leds.color);
        if (typeof snapshot?.leds?.brightness === 'number') setBrightnessDraft(snapshot.leds.brightness);
    }, [snapshot?.leds?.color, snapshot?.leds?.brightness]);

    useEffect(() => {
        if (snapshot?.widgets) {
            const sorted = [...snapshot.widgets].sort((a, b) => a.orderIndex - b.orderIndex);
            setWidgetsDraft(sorted);
            const ww = sorted.find((w) => w.key === 'weather');
            if (ww?.config?.city) setWeatherCity(String(ww.config.city));
            if (ww?.enabled && (ww?.config?.city as string | undefined)) {
                fetchWeather(String(ww.config.city), 'metric', deviceId);
            }
        }
    }, [snapshot?.widgets, deviceId, fetchWeather]);

    useEffect(() => {
        navigation.setOptions({
            headerShown: true,
            headerTransparent: true,
            headerTitle: () => <HeaderTitle name={deviceMeta?.name} online={deviceMeta?.online} />,
            headerRight: () => (
                <KebabMenu
                    onRename={() => setRenaming(true)}
                    onDelete={() => {
                        Alert.alert('Dissocier le miroir', 'Cette action est définitive. Continuer ?', [
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
                                },
                            },
                        ]);
                    }}
                />
            ),
            headerTitleAlign: 'left',
            headerTintColor: '#fff',
        } as any);
    }, [navigation, deviceMeta?.name, deviceMeta?.online, deleteDevice, deviceId, refreshDevices, router]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchSnapshot(deviceId), refreshDevices()]);
            await Haptics.selectionAsync();
        } finally {
            setRefreshing(false);
        }
    }, [deviceId, fetchSnapshot, refreshDevices]);

    async function onConfirmRename() {
        const name = newName.trim();
        if (!name) return;
        try {
            await renameDevice(deviceId, name);
            await refreshDevices();
            setRenaming(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
            Alert.alert('Erreur', "Impossible de renommer l'appareil.");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }

    async function handleToggle() {
        try {
            await ledsToggle(deviceId, !snapshot?.leds.on);
            Haptics.selectionAsync();
        } catch {
            Alert.alert('Erreur', 'Échec de la commande on/off.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }
    async function handleApplyColor() {
        const v = colorText.trim();
        if (!isHex(v)) {
            Alert.alert('Couleur invalide', 'Utilise un hex du type #RRGGBB.');
            return;
        }
        try {
            await ledsStyle(deviceId, { color: v, preset: null });
            Haptics.selectionAsync();
        } catch {
            Alert.alert('Erreur', "Impossible d'appliquer la couleur.");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }
    async function handleSwatch(c: string) {
        setColorText(c);
        try {
            await ledsStyle(deviceId, { color: c, preset: null });
            Haptics.selectionAsync();
        } catch {
            Alert.alert('Erreur', "Impossible d'appliquer la couleur.");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }
    async function commitBrightness(v: number) {
        try {
            await ledsStyle(deviceId, { brightness: Math.round(v) });
            Haptics.selectionAsync();
        } catch {
            Alert.alert('Erreur', 'Impossible de modifier la luminosité.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }
    async function applyPreset(p: string | null) {
        try {
            await ledsStyle(deviceId, { preset: p });
            Haptics.selectionAsync();
        } catch {
            Alert.alert('Erreur', "Impossible d'appliquer le preset.");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }

    async function togglePlayPause() {
        if (!snapshot) return;
        const next = snapshot.music.status === 'play' ? 'pause' : 'play';
        try {
            await musicCmd(deviceId, next);
            Haptics.selectionAsync();
        } catch {
            Alert.alert('Erreur', 'Commande play/pause échouée.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }
    async function nextTrack() {
        try {
            await musicCmd(deviceId, 'next');
            Haptics.selectionAsync();
        } catch {
            Alert.alert('Erreur', 'Commande next échouée.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }
    async function prevTrack() {
        try {
            await musicCmd(deviceId, 'prev');
            Haptics.selectionAsync();
        } catch {
            Alert.alert('Erreur', 'Commande prev échouée.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }
    async function setVolume(v: number) {
        try {
            await musicSetVolume(deviceId, v);
            Haptics.selectionAsync();
        } catch {
            Alert.alert('Erreur', 'Changement de volume échoué.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }

    function toggleWidget(key: WidgetItem['key']) {
        setWidgetsDraft((prev) => prev.map((w) => (w.key === key ? { ...w, enabled: !w.enabled } : w)));
    }
    function reorder(from: number, to: number) {
        setWidgetsDraft((prev) => {
            const arr = [...prev].sort((a, b) => a.orderIndex - b.orderIndex);
            const srcIdx = arr.findIndex((w) => w.orderIndex === from);
            const dstIdx = arr.findIndex((w) => w.orderIndex === to);
            if (srcIdx < 0 || dstIdx < 0) return prev;
            const item = arr.splice(srcIdx, 1)[0];
            arr.splice(dstIdx, 0, item);
            return arr.map((w, i) => ({ ...w, orderIndex: i }));
        });
    }
    async function saveWidgets() {
        if (!widgetsDraft.length) {
            Alert.alert('Info', "Ajoute au moins un widget avant d'enregistrer.");
            return;
        }
        try {
            const normalized = [...widgetsDraft]
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((w, i) => ({ ...w, orderIndex: i }));
            await widgetsPut(deviceId, normalized);
            await fetchSnapshot(deviceId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const ww = normalized.find((w) => w.key === 'weather');
            if (ww?.enabled && ww?.config?.city) {
                fetchWeather(String(ww.config.city), 'metric', deviceId);
            }
            setOpenWidgets(false);
            Alert.alert('OK', 'Widgets enregistrés.');
        } catch {
            Alert.alert('Erreur', "Échec d'enregistrement des widgets.");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }
    function updateWeatherCityLocally(city: string) {
        setWeatherCity(city);
        setWidgetsDraft((prev) =>
            prev.map((w) => (w.key === 'weather' ? { ...w, config: { ...(w.config ?? {}), city } } : w))
        );
    }
    function addDefaultWidgets() { setWidgetsDraft(DEFAULT_WIDGETS); }

    const panRespondersRef = useRef<Record<number, any>>({});
    const isDraggingRef = useRef(false);
    const [draggingOrder, setDraggingOrder] = useState<number | null>(null);

    function makePanResponder(orderIndex: number) {
        if (panRespondersRef.current[orderIndex]) return panRespondersRef.current[orderIndex];
        panRespondersRef.current[orderIndex] = PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6,
            onPanResponderGrant: (_e, g) => {
                isDraggingRef.current = true;
                dragIndexRef.current = orderIndex;
                startYRef.current = g.y0;
                setDraggingOrder(orderIndex);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            },
            onPanResponderMove: (_e, g) => {
                if (!isDraggingRef.current || dragIndexRef.current == null) return;
                const delta = g.moveY - startYRef.current;
                const steps = Math.trunc(delta / itemHeight);
                const from = dragIndexRef.current;
                let to = from + steps;
                const maxIndex = widgetsDraft.length - 1;
                if (to < 0) to = 0;
                if (to > maxIndex) to = maxIndex;
                if (to !== from) {
                    reorder(from, to);
                    dragIndexRef.current = to;
                    startYRef.current = g.moveY;
                    Haptics.selectionAsync();
                }
            },
            onPanResponderRelease: () => {
                isDraggingRef.current = false;
                dragIndexRef.current = null;
                setDraggingOrder(null);
            },
            onPanResponderTerminate: () => {
                isDraggingRef.current = false;
                dragIndexRef.current = null;
                setDraggingOrder(null);
            },
        });
        return panRespondersRef.current[orderIndex];
    }

    const ledsOn = !!snapshot?.leds.on;
    const isPlaying = snapshot?.music.status === 'play';

    return (
        <LinearGradient colors={['#1a1440', '#1b1f5c', '#0d1030']} style={styles.fill}>
            <AuroraBackground />

            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTransparent: true,
                    headerTitleAlign: 'left',
                    headerTintColor: '#fff',
                }}
            />

            {loading && !snapshot ? (
                <View style={styles.center}>
                    <ActivityIndicator color="#fff" />
                    <Text style={{ marginTop: 8, color: 'rgba(255,255,255,0.8)' }}>Chargement du snapshot…</Text>
                </View>
            ) : error ? (
                <View style={{ flex: 1, padding: 16 }}>
                    <GlassCard padding={16} intensity={34} overlayOpacity={0.26}>
                        <Text style={{ color: Colors.feedback.error, fontWeight: '900', marginBottom: 12 }}>{error}</Text>
                        <PrimaryButton
                            label="Réessayer"
                            onPress={() => { fetchSnapshot(deviceId); refreshDevices(); }}
                        />
                    </GlassCard>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingBottom: 40,
                        gap: 16,
                        paddingTop: (insets.top || 0) + (HEADER_HEIGHT as number) + 6,
                    }}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />
                    }
                    style={{ backgroundColor: 'transparent' }}
                >
                    <GlassCard style={{ gap: 14 }} padding={18} intensity={30} overlayOpacity={0.24}>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>Raccourcis</Text>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <PillButton
                                label={ledsOn ? 'LEDs ON' : 'LEDs OFF'}
                                onPress={handleToggle}
                                active={ledsOn}
                                style={{ flex: 1 }}
                            />
                            <PillButton
                                label={isPlaying ? 'Pause' : 'Lecture'}
                                onPress={togglePlayPause}
                                active={isPlaying}
                                style={{ flex: 1 }}
                            />
                        </View>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center' }}>
                            Astuce : tire vers le bas pour rafraîchir.
                        </Text>
                    </GlassCard>

                    <GlassCard style={{ gap: 12 }} padding={16} intensity={30} overlayOpacity={0.24}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff' }}>Actions</Text>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <IconTile emoji="💡" label="LEDs" onPress={() => setOpenLEDs(true)} />
                            <IconTile emoji="🎵" label="Musique" onPress={() => setOpenMusic(true)} />
                            <IconTile emoji="🧩" label="Widgets" onPress={() => setOpenWidgets(true)} />
                        </View>
                    </GlassCard>

                    {widgetsDraft.find((w) => w.key === 'weather' && w.enabled) && (
                        <GlassCard style={{ gap: 8 }} padding={16} intensity={30} overlayOpacity={0.24}>
                            <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff' }}>Météo — {weatherCity}</Text>
                            {weatherLoading ? (
                                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 }}>
                                    <ActivityIndicator color="#fff" />
                                    <Text style={{ color: '#fff' }}>Chargement…</Text>
                                </View>
                            ) : weatherError ? (
                                <Text style={{ marginTop: 6, color: Colors.feedback.error, fontWeight: '700' }}>{weatherError}</Text>
                            ) : weather ? (
                                <View style={{ marginTop: 4 }}>
                                    <Text style={{ fontSize: 28, fontWeight: '900', color: '#fff' }}>{Math.round(weather.temp)}°</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.88)' }}>{weather.desc}</Text>
                                    <Text style={{ marginTop: 4, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                                        MAJ {new Date(weather.updatedAt).toLocaleTimeString()} • TTL {weather.ttlSec}s
                                    </Text>
                                </View>
                            ) : (
                                <Text style={{ marginTop: 6, color: 'rgba(255,255,255,0.7)' }}>Aucune donnée.</Text>
                            )}
                        </GlassCard>
                    )}

                    {renaming && (
                        <GlassCard style={{ gap: 12 }} padding={16} intensity={30} overlayOpacity={0.24}>
                            <Text style={{ fontWeight: '900', fontSize: 16, color: '#fff' }}>Renommer le miroir</Text>
                            <GlassInput value={newName} onChangeText={setNewName} placeholder="Nouveau nom" />
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <PrimaryButton label="Enregistrer" onPress={onConfirmRename} />
                                <GhostButton label="Annuler" onPress={() => setRenaming(false)} />
                            </View>
                        </GlassCard>
                    )}

                    <View style={{ alignItems: 'center', marginTop: 8 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                            Dernier contact : {formatAgo(deviceMeta?.lastSeenAt)}
                        </Text>
                    </View>
                </ScrollView>
            )}

            <Sheet visible={openLEDs} onClose={() => setOpenLEDs(false)} title="LEDs">
                {!snapshot ? (
                    <Text style={{ color: '#fff' }}>Chargement…</Text>
                ) : (
                    <View style={{ gap: 16 }}>
                        <PillButton label={snapshot.leds.on ? 'Éteindre' : 'Allumer'} onPress={handleToggle} active={snapshot.leds.on} />

                        <View>
                            <Text style={{ fontWeight: '800', marginBottom: 8, color: '#fff' }}>Couleur rapide</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                {SWATCHES.map((c) => (
                                    <Pressable
                                        key={c}
                                        onPress={() => handleSwatch(c)}
                                        style={{
                                            width: 36, height: 36, borderRadius: 999,
                                            borderWidth: 2,
                                            borderColor: (snapshot.leds.color || '').toLowerCase() === c.toLowerCase() ? Colors.primary.solid : 'rgba(255,255,255,0.22)',
                                            backgroundColor: c,
                                        }}
                                    />
                                ))}
                            </View>
                        </View>

                        <View>
                            <Text style={{ fontWeight: '800', marginBottom: 6, color: '#fff' }}>Couleur (#RRGGBB)</Text>
                            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                <GlassInput
                                    value={colorText}
                                    onChangeText={setColorText}
                                    placeholder="#00C2FF"
                                    style={{ flex: 1 }}
                                />
                                <PrimaryButton label="Appliquer" onPress={handleApplyColor} />
                            </View>
                        </View>

                        <View>
                            <Text style={{ fontWeight: '800', marginBottom: 6, color: '#fff' }}>Luminosité : {brightnessDraft}%</Text>
                            <Slider
                                minimumValue={0}
                                maximumValue={100}
                                value={brightnessDraft}
                                onValueChange={(v) => setBrightnessDraft(Math.round(v))}
                                onSlidingComplete={(v) => commitBrightness(Array.isArray(v) ? v[0] : v)}
                                step={1}
                                style={{ width: '100%', height: 40 }}
                            />
                        </View>

                        <View>
                            <Text style={{ fontWeight: '800', marginBottom: 6, color: '#fff' }}>Presets</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {PRESETS.map((p) => (
                                    <PillButton
                                        key={p}
                                        label={p}
                                        onPress={() => applyPreset(p)}
                                        active={snapshot.leds.preset === p}
                                    />
                                ))}
                                <PillButton label="none" onPress={() => applyPreset(null)} active={!snapshot.leds.preset} />
                            </View>
                        </View>
                    </View>
                )}
            </Sheet>

            <Sheet visible={openMusic} onClose={() => setOpenMusic(false)} title="Musique">
                {!snapshot ? (
                    <Text style={{ color: '#fff' }}>Chargement…</Text>
                ) : (
                    <View style={{ gap: 16 }}>
                        {/* Play/Pause + Prev/Next */}
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <PrimaryButton
                                label={snapshot.music.status === 'play' ? 'Pause' : 'Lecture'}
                                onPress={togglePlayPause}
                                style={{ flex: 1 } as any}
                            />
                            <GhostButton label="⟨⟨" onPress={prevTrack} style={{ minWidth: 56 }} />
                            <GhostButton label="⟩⟩" onPress={nextTrack} style={{ minWidth: 56 }} />
                        </View>

                        <View>
                            <Text style={{ fontWeight: '800', marginBottom: 6, color: '#fff' }}>Volume : {snapshot.music.volume}</Text>
                            <Slider
                                minimumValue={0}
                                maximumValue={100}
                                value={snapshot.music.volume}
                                onSlidingComplete={(v) => setVolume(Array.isArray(v) ? Math.round(v[0]) : Math.round(v))}
                                step={1}
                                style={{ width: '100%', height: 40 }}
                            />
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                {[0, 50, 100].map((v) => (
                                    <PillButton key={v} label={String(v)} onPress={() => setVolume(v)} active={(snapshot.music.volume ?? -1) === v} />
                                ))}
                            </View>
                        </View>
                    </View>
                )}
            </Sheet>

            <Sheet visible={openWidgets} onClose={() => setOpenWidgets(false)} title="Widgets">
                <View style={{ gap: 12 }}>
                    {!widgetsDraft.length ? (
                        <View style={{ gap: 10 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.8)' }}>
                                Aucun widget configuré pour ce miroir.
                            </Text>
                            <PrimaryButton label="Ajouter les widgets par défaut" onPress={addDefaultWidgets} />
                        </View>
                    ) : (
                        <>
                            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                                Astuce : maintien + glisse pour réordonner.
                            </Text>
                            {widgetsDraft
                                .sort((a, b) => a.orderIndex - b.orderIndex)
                                .map((w) => {
                                    const pan = makePanResponder(w.orderIndex);
                                    return (
                                        <View
                                            key={w.key}
                                            onLayout={(e: LayoutChangeEvent) => setItemHeight(e.nativeEvent.layout.height)}
                                            {...pan.panHandlers}
                                            style={{
                                                paddingVertical: 10,
                                                paddingHorizontal: 8,
                                                borderBottomWidth: 1,
                                                borderBottomColor: 'rgba(255,255,255,0.10)',
                                                gap: 8,
                                                backgroundColor: draggingOrder === w.orderIndex ? 'rgba(122,90,248,0.10)' : 'transparent',
                                                borderRadius: 12,
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <Text style={{ fontWeight: '800', color: '#fff' }}>{w.key}</Text>
                                                <Text style={{ color: 'rgba(255,255,255,0.6)' }}>#{w.orderIndex}</Text>
                                            </View>

                                            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                                                <PillButton
                                                    label={w.enabled ? 'Activé' : 'Désactivé'}
                                                    onPress={() => toggleWidget(w.key as any)}
                                                    active={w.enabled}
                                                />
                                                <Text style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.65)' }}>☰ long press</Text>
                                            </View>

                                            {w.key === 'weather' && (
                                                <View style={{ marginTop: 6, gap: 6 }}>
                                                    <Text style={{ fontWeight: '800', color: '#fff' }}>Ville (météo)</Text>
                                                    <GlassInput
                                                        value={weatherCity}
                                                        onChangeText={updateWeatherCityLocally}
                                                        placeholder="Paris"
                                                    />
                                                    <GhostButton label="Tester la météo" onPress={() => fetchWeather(weatherCity, 'metric', deviceId)} />
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}

                            <PrimaryButton label="Enregistrer les widgets" onPress={saveWidgets} />
                        </>
                    )}
                </View>
            </Sheet>
        </LinearGradient>
    );
}

function AuroraBackground() {
    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <LinearGradient
                colors={['rgba(122,90,248,0.45)', 'rgba(122,90,248,0.0)']}
                style={[styles.blob, { top: -W * 0.25, left: -W * 0.3, width: W * 0.9, height: W * 0.9 }]}
                start={{ x: 0.1, y: 0.1 }}
                end={{ x: 0.9, y: 0.9 }}
            />
            <LinearGradient
                colors={['rgba(77,168,240,0.40)', 'rgba(77,168,240,0.0)']}
                style={[styles.blob, { top: H * 0.15, right: -W * 0.2, width: W * 0.8, height: W * 0.8 }]}
                start={{ x: 0.2, y: 0.2 }}
                end={{ x: 0.8, y: 0.8 }}
            />
            <LinearGradient
                colors={['rgba(255,100,180,0.25)', 'rgba(255,100,180,0.0)']}
                style={[styles.blob, { bottom: -W * 0.25, left: W * 0.15, width: W, height: W }]}
                start={{ x: 0.2, y: 0.2 }}
                end={{ x: 0.8, y: 0.8 }}
            />
        </View>
    );
}

function GlassInput({
                        value, onChangeText, placeholder, style,
                    }: {
    value: string;
    onChangeText: (t: string) => void;
    placeholder?: string;
    style?: any;
}) {
    return (
        <View style={[{ borderRadius: 12, overflow: 'hidden' }, style]}>
            <GlassCard padding={0} intensity={34} overlayOpacity={0.22}>
                <View style={{ paddingHorizontal: 12 }}>
                    <TextInput
                        value={value}
                        onChangeText={onChangeText}
                        placeholder={placeholder}
                        placeholderTextColor="rgba(255,255,255,0.55)"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={{ height: 44, color: '#fff' }}
                    />
                </View>
            </GlassCard>
        </View>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    blob: {
        position: 'absolute',
        borderRadius: 9999,
        opacity: 1,
    },

    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'flex-end',
    },
    sheetWrap: {
        paddingHorizontal: 12,
    },
});
