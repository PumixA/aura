import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    Pressable,
    StyleSheet,
    Dimensions,
    ActivityIndicator,
    Alert,
    Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors } from '../constants/Colors';
import { GlassCard } from '../components/ui';
import { api } from '../src/api/client';
import { useDevices } from '../src/store/devices';

const { width: W } = Dimensions.get('window');

function parseQR(input: string): { deviceId?: string; token?: string } {
    try {
        const t = input.trim();

        // Payload JSON possible
        if (t.startsWith('{') && t.endsWith('}')) {
            const j = JSON.parse(t);
            return {
                deviceId: j.deviceId ?? j.id ?? undefined,
                token: j.token ?? j.pairingToken ?? undefined,
            };
        }

        // URL aura://pair?deviceId=...&token=...
        const u = new URL(t);
        const deviceId = u.searchParams.get('deviceId') ?? undefined;
        const token =
            u.searchParams.get('token') ??
            u.searchParams.get('pairingToken') ??
            undefined;
        return { deviceId, token };
    } catch {
        // Secours : uniquement un token numérique
        if (/^[0-9]{4,8}$/.test(input.trim())) {
            return { token: input.trim() };
        }
        return {};
    }
}

export default function PairQR() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const fetchDevices = useDevices((s) => s.fetchDevices);

    // Caméra
    const [permission, requestPermission] = useCameraPermissions();
    const needPermission = useMemo(() => !permission || !permission.granted, [permission]);

    // UI
    const [torch, setTorch] = useState<'on' | 'off'>('off');
    const [loading, setLoading] = useState(false);

    // Anti double-scan
    const scannedOnceRef = useRef(false);

    const requestCam = useCallback(async () => {
        const res = await requestPermission();
        if (!res.granted) {
            Alert.alert(
                'Permission caméra requise',
                "Active la caméra pour scanner un QR code et appairer un miroir."
            );
        }
    }, [requestPermission]);

    const handlePair = useCallback(
        async (deviceId: string, token: string) => {
            setLoading(true);
            try {
                await api.post('/devices/pair', { deviceId, pairingToken: token });
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Succès', 'Appareil appairé !');
                await fetchDevices();
                router.back();
            } catch (e: any) {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                const status = e?.response?.status;
                if (status === 400) Alert.alert('Aucun token actif', "Le miroir n'a pas de token actif.");
                else if (status === 401) Alert.alert('Token invalide', 'Le token scanné est incorrect.');
                else if (status === 409) Alert.alert('Conflit', 'Appareil déjà appairé ou désactivé.');
                else if (status === 410) Alert.alert('Expiré', 'Le token est expiré, régénère-le sur le miroir.');
                else Alert.alert('Erreur', "Impossible d'appairer l'appareil.");
            } finally {
                setLoading(false);
            }
        },
        [fetchDevices, router]
    );

    const onBarcodeScanned = useCallback(
        ({ data }: { data: string }) => {
            if (scannedOnceRef.current) return;
            scannedOnceRef.current = true;

            const { deviceId, token } = parseQR(data);
            if (!deviceId || !token) {
                scannedOnceRef.current = false;
                Alert.alert('QR invalide', "Ce QR doit contenir deviceId et token.");
                return;
            }
            handlePair(deviceId, token);
        },
        [handlePair]
    );

    return (
        <LinearGradient colors={['#1a1440', '#1b1f5c', '#0d1030']} style={styles.fill}>
            <AuroraBackground />

            <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title}>Scanner un miroir</Text>
                        <Text style={styles.subtitle}>Cadre le QR code affiché sur l’appareil</Text>
                    </View>
                    <Pressable
                        onPress={() => router.back()}
                        accessibilityRole="button"
                        accessibilityLabel="Fermer"
                        style={({ pressed }) => [styles.close, pressed && { opacity: 0.9 }]}
                    >
                        <Ionicons name="close" size={20} color="#fff" />
                    </Pressable>
                </View>

                {/* Carte caméra */}
                <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
                    <GlassCard style={{ overflow: 'hidden', padding: 0 }}>
                        {needPermission ? (
                            <View style={styles.centerCam}>
                                <Ionicons name="camera-outline" size={42} color="rgba(255,255,255,0.7)" />
                                <Text style={styles.camText}>
                                    Autorise l’accès à la caméra pour scanner le QR.
                                </Text>
                                <Pressable
                                    onPress={requestCam}
                                    style={({ pressed }) => [styles.primaryBtn, pressed && { transform: [{ scale: 0.99 }] }]}
                                >
                                    <Text style={styles.primaryBtnText}>Autoriser la caméra</Text>
                                </Pressable>
                            </View>
                        ) : (
                            <View style={{ height: W * 1.05, backgroundColor: '#000' }}>
                                <CameraView
                                    style={{ flex: 1 }}
                                    torch={torch}
                                    barcodeScannerSettings={{
                                        barcodeTypes: ['qr'],
                                    }}
                                    onBarcodeScanned={(result) => {
                                        if (result?.data) onBarcodeScanned({ data: result.data });
                                    }}
                                />
                                {/* Overlay visuel de cadrage */}
                                <View pointerEvents="none" style={styles.overlay}>
                                    <View style={[styles.corner, styles.cTL]} />
                                    <View style={[styles.corner, styles.cTR]} />
                                    <View style={[styles.corner, styles.cBL]} />
                                    <View style={[styles.corner, styles.cBR]} />
                                </View>

                                {/* Boutons actions */}
                                <View style={styles.cameraActions}>
                                    <Pressable
                                        onPress={() => setTorch((t) => (t === 'on' ? 'off' : 'on'))}
                                        accessibilityRole="button"
                                        accessibilityLabel="Activer la lampe torche"
                                        style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.9 }]}
                                    >
                                        <Ionicons
                                            name={torch === 'on' ? 'flashlight' : 'flashlight-outline'}
                                            size={20}
                                            color="#fff"
                                        />
                                        <Text style={styles.actionText}>
                                            {torch === 'on' ? 'Torche ON' : 'Torche OFF'}
                                        </Text>
                                    </Pressable>

                                    {Platform.OS === 'web' && (
                                        <Text style={styles.webHint}>
                                            Sur web, l’accès caméra requiert https:// (ou localhost).
                                        </Text>
                                    )}
                                </View>
                            </View>
                        )}
                    </GlassCard>
                </View>

                {/* Footer / état */}
                <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
                    <View style={styles.footerRow}>
                        <Ionicons name="qr-code-outline" size={16} color="rgba(255,255,255,0.8)" />
                        <Text style={styles.footerText}>Le scan démarre automatiquement.</Text>
                        {loading && (
                            <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <ActivityIndicator color="#fff" />
                                <Text style={{ color: '#fff', fontWeight: '700' }}>Appairage…</Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>
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
                style={[styles.blob, { top: W * 0.45, right: -W * 0.2, width: W * 0.8, height: W * 0.8 }]}
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

const styles = StyleSheet.create({
    fill: { flex: 1 },
    screen: { flex: 1, backgroundColor: 'transparent' },

    blob: {
        position: 'absolute',
        borderRadius: 9999,
        opacity: 1,
    },

    header: {
        paddingHorizontal: 16,
        paddingBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    title: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '900',
    },
    subtitle: {
        color: 'rgba(255,255,255,0.82)',
        marginTop: 2,
    },
    close: {
        width: 36,
        height: 36,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        backgroundColor: 'rgba(15,16,24,0.22)',
    },

    centerCam: {
        height: W * 1.05,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 16,
    },
    camText: {
        color: 'rgba(255,255,255,0.85)',
        textAlign: 'center',
    },
    primaryBtn: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        backgroundColor: 'rgba(15,16,24,0.22)',
    },
    primaryBtnText: { color: '#fff', fontWeight: '800' },

    overlay: {
        position: 'absolute',
        left: 16,
        right: 16,
        top: 16,
        bottom: 64,
        borderRadius: 18,
    },
    corner: {
        position: 'absolute',
        width: 26,
        height: 26,
        borderColor: 'rgba(255,255,255,0.9)',
    },
    cTL: { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 8 },
    cTR: { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 8 },
    cBL: { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 8 },
    cBR: { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 8 },

    cameraActions: {
        position: 'absolute',
        left: 10,
        right: 10,
        bottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        backgroundColor: 'rgba(15,16,24,0.28)',
    },
    actionText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 12.5,
    },
    webHint: {
        marginLeft: 'auto',
        color: 'rgba(255,255,255,0.75)',
        fontSize: 12,
    },

    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    footerText: {
        color: 'rgba(255,255,255,0.85)',
    },
});
