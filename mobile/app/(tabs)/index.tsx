// app/(tabs)/index.tsx
import React, { useEffect, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    FlatList,
    RefreshControl,
    Pressable,
    StyleSheet,
    Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDevices } from '../../src/store/devices';
import { Colors } from '../../constants/Colors';
import { GlassCard } from '../../components/ui';

const { width: W, height: H } = Dimensions.get('window');

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
    const insets = useSafeAreaInsets();

    const items = useDevices((s) => s.items);
    const loading = useDevices((s) => s.loading);
    const error = useDevices((s) => s.error);
    const fetchDevices = useDevices((s) => s.fetchDevices);

    useEffect(() => { fetchDevices(); }, [fetchDevices]);

    const onAdd = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push('/pair-qr');
    }, [router]);

    const count = useMemo(() => items.length, [items.length]);

    const ListHeader = (
        <View style={styles.headerWrap}>
            <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title}>Mes miroirs</Text>
                    <Text style={styles.subtitle}>Gère et personnalise tes appareils</Text>
                </View>
                <View style={styles.countBadge}>
                    <Ionicons name="albums-outline" size={14} color="rgba(255,255,255,0.95)" />
                    <Text style={styles.countText}>
                        {count} appareil{count > 1 ? 's' : ''}
                    </Text>
                </View>
            </View>
            <Text style={styles.hint}>Tire pour rafraîchir</Text>
        </View>
    );

    const Separator = () => <View style={{ height: 12 }} />;

    const renderItem = ({ item }: any) => {
        const online = !!item.online;
        const statusText = online ? 'En ligne' : `Hors ligne • vu ${formatAgo(item.lastSeenAt)}`;
        const statusDot = online ? Colors.status.onlineText : Colors.status.offlineText;
        const grad = online
            ? ['rgba(34,197,94,0.22)', 'rgba(74,222,128,0.22)']
            : ['rgba(248,113,113,0.22)', 'rgba(239,68,68,0.22)'];

        return (
            <Pressable
                onPress={async () => {
                    await Haptics.selectionAsync();
                    router.push(`/device/${item.id}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Ouvrir ${item.name}`}
                style={({ pressed }) => [{ opacity: pressed ? 0.96 : 1 }]}
            >
                <GlassCard style={{ overflow: 'hidden' }}>
                    <Ionicons
                        name={online ? 'hardware-chip-outline' : 'cloud-offline-outline'}
                        size={92}
                        color="rgba(255,255,255,0.06)"
                        style={styles.watermark}
                    />
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text numberOfLines={1} style={styles.cardTitle}>{item.name}</Text>
                        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" style={{ marginLeft: 'auto' }} />
                    </View>
                    <View style={styles.statusRow}>
                        <Ionicons name="ellipse" size={10} color={statusDot} />
                        <LinearGradient colors={grad} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.statusBadge}>
                            <Text style={styles.statusText}>{statusText}</Text>
                        </LinearGradient>
                    </View>
                </GlassCard>
            </Pressable>
        );
    };

    /* --------- rendu --------- */
    return (
        <LinearGradient
            colors={['#1a1440', '#1b1f5c', '#0d1030']}
            style={styles.fill}
        >
            {/* Blobs pour continuité visuelle avec (tabs)/_layout */}
            <AuroraBackground />

            {/* Contenu transparent au-dessus du gradient */}
            <View style={styles.screen}>
                {/* ÉTAT : loading (skeleton) */}
                {loading && !items.length ? (
                    <>
                        {ListHeader}
                        <View style={{ paddingHorizontal: 16 }}>
                            {[0, 1, 2].map((i) => (
                                <GlassCard key={i} style={styles.skeletonCard}>
                                    <View style={styles.skeletonTitle} />
                                    <View style={styles.skeletonBadge} />
                                </GlassCard>
                            ))}
                        </View>
                        <FloatingPlus onPress={onAdd} bottomInset={insets.bottom} />
                    </>
                ) : null}

                {/* ÉTAT : erreur vide */}
                {error && !items.length ? (
                    <View style={[styles.center, { paddingHorizontal: 16 }]}>
                        <GlassCard style={{ alignSelf: 'stretch' }}>
                            <Text style={{ color: Colors.feedback.error, fontWeight: '800', marginBottom: 8 }}>
                                {error}
                            </Text>
                            <Pressable onPress={fetchDevices} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.9 }]}>
                                <Text style={styles.retryText}>Réessayer</Text>
                            </Pressable>
                        </GlassCard>
                        <FloatingPlus onPress={onAdd} bottomInset={insets.bottom} />
                    </View>
                ) : null}

                {/* ÉTAT : aucun appareil */}
                {!loading && !error && !items.length ? (
                    <View style={[styles.center, { paddingHorizontal: 16 }]}>
                        {ListHeader}
                        <GlassCard style={{ alignSelf: 'stretch' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <Ionicons name="cube-outline" size={22} color="rgba(255,255,255,0.78)" />
                                <Text style={[styles.cardTitle, { marginLeft: 8 }]}>Aucun appareil</Text>
                            </View>
                            <Text style={styles.emptyText}>
                                Utilise le bouton “+” pour lancer l’association avec un miroir.
                            </Text>
                        </GlassCard>
                        <FloatingPlus onPress={onAdd} bottomInset={insets.bottom} />
                    </View>
                ) : null}

                {/* LISTE */}
                {!!items.length ? (
                    <>
                        <FlatList
                            data={items}
                            keyExtractor={(d) => d.id}
                            renderItem={renderItem}
                            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                            ListHeaderComponent={ListHeader}
                            style={{ backgroundColor: 'transparent' }}
                            contentContainerStyle={{
                                paddingBottom: 24 + 72 + insets.bottom,
                                paddingHorizontal: 16,
                                paddingTop: 8,
                            }}
                            refreshControl={
                                <RefreshControl
                                    refreshing={loading}
                                    onRefresh={async () => {
                                        await fetchDevices();
                                        Haptics.selectionAsync();
                                    }}
                                    tintColor="#ffffff"
                                />
                            }
                            removeClippedSubviews
                            initialNumToRender={6}
                            windowSize={10}
                        />
                        <FloatingPlus onPress={onAdd} bottomInset={insets.bottom} />
                    </>
                ) : null}
            </View>
        </LinearGradient>
    );
}

/* ---------- Arrière-plan "aurora" local ---------- */
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

/* ============ FAB “+” ============ */
function FloatingPlus({ onPress, bottomInset }: { onPress: () => void; bottomInset: number }) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="Ajouter un appareil"
            style={({ pressed }) => [
                styles.fab,
                { right: 18, bottom: bottomInset + 18 },
                pressed && { transform: [{ scale: 0.98 }] },
            ]}
            hitSlop={8}
        >
            <LinearGradient
                colors={['#7A5AF8', '#4DA8F0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fabInner}
            >
                <View style={styles.fabBorder} />
                <Ionicons name="add" size={26} color="#fff" />
            </LinearGradient>
        </Pressable>
    );
}

/* ===================== Styles ===================== */

const styles = StyleSheet.create({
    fill: { flex: 1 },
    screen: { flex: 1, backgroundColor: 'transparent' },
    center: { justifyContent: 'center', alignItems: 'center', gap: 16 },

    blob: {
        position: 'absolute',
        borderRadius: 9999,
        opacity: 1,
    },

    /* Header */
    headerWrap: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 10,
        backgroundColor: 'transparent',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
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
    hint: {
        color: 'rgba(255,255,255,0.6)',
        marginTop: 8,
        fontSize: 12,
    },

    /* Compteur */
    countBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        backgroundColor: 'rgba(15,16,24,0.22)',
    },
    countText: {
        color: 'rgba(255,255,255,0.95)',
        fontWeight: '800',
        fontSize: 13,
    },

    /* Cards */
    cardTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.96)',
        flexShrink: 1,
        maxWidth: '90%',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        gap: 10,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    statusText: {
        color: 'rgba(255,255,255,0.88)',
        fontWeight: '700',
        fontSize: 12.5,
    },
    watermark: {
        position: 'absolute',
        right: -6,
        bottom: -10,
    },

    /* Skeletons */
    skeletonCard: { marginBottom: 12 },
    skeletonTitle: {
        height: 18,
        width: '60%',
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.12)',
        marginBottom: 12,
    },
    skeletonBadge: {
        height: 26,
        width: 160,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.10)',
    },

    /* FAB */
    fab: {
        position: 'absolute',
        zIndex: 40,
    },
    fabInner: {
        width: 60,
        height: 60,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fabBorder: {
        position: 'absolute',
        inset: 0 as any,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.32)',
    },

    /* Retry (erreur) */
    retry: {
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        backgroundColor: 'rgba(15,16,24,0.22)',
    },
    retryText: {
        color: '#fff',
        fontWeight: '800',
    },
});
