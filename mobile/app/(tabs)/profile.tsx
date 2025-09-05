import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, StyleSheet, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../../src/store/auth';
import { GlassCard, PrimaryButton } from '../../components/ui';
import { Colors } from '../../constants/Colors';

const { width: W, height: H } = Dimensions.get('window');

export default function Profile() {
    const insets   = useSafeAreaInsets();
    const router   = useRouter();

    const user     = useAuth((s) => s.user);
    const loading  = useAuth((s) => s.loading);
    const updateMe = useAuth((s) => s.updateMe);
    const logout   = useAuth((s) => s.logout);

    const [editing, setEditing] = useState(false);
    const [firstName, setFirst] = useState(user?.firstName ?? '');
    const [lastName,  setLast]  = useState(user?.lastName ?? '');
    const [signingOut, setSigningOut] = useState(false);

    const initials = useMemo(() => {
        const f = (user?.firstName || '').trim();
        const l = (user?.lastName || '').trim();
        const a = (f ? f[0] : '') + (l ? l[0] : '');
        return a || (user?.email?.[0]?.toUpperCase() ?? '?');
    }, [user?.firstName, user?.lastName, user?.email]);

    async function onSave() {
        const payload: { firstName?: string; lastName?: string } = {};
        if (firstName.trim() !== (user?.firstName ?? '')) payload.firstName = firstName.trim();
        if (lastName.trim()  !== (user?.lastName  ?? '')) payload.lastName  = lastName.trim();

        if (!payload.firstName && !payload.lastName) {
            setEditing(false);
            return;
        }

        try {
            await updateMe(payload);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setEditing(false);
        } catch (e) {
            Alert.alert('Erreur', "Mise à jour impossible pour le moment.");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }

    async function onLogout() {
        setSigningOut(true);
        try {
            await logout();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.replace('/(auth)/login');
        } catch {
            Alert.alert('Erreur', 'Déconnexion impossible.');
        } finally {
            setSigningOut(false);
        }
    }

    return (
        <View style={[styles.fill]}>
            <LinearGradient colors={['#1a1440', '#1b1f5c', '#0d1030']} style={StyleSheet.absoluteFill} />
            <AuroraBackground />

            <View style={[styles.fill, styles.transparent, { paddingTop: insets.top + 8 }]}>
                <View style={[styles.header, { paddingBottom: 6 }]}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title}>Mon compte</Text>
                        <Text style={styles.subtitle}>{user?.email}</Text>
                    </View>
                    {!editing ? (
                        <Pressable
                            onPress={() => { setFirst(user?.firstName ?? ''); setLast(user?.lastName ?? ''); setEditing(true); }}
                            accessibilityRole="button"
                            style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.9 }]}
                        >
                            <Text style={styles.editBtnLabel}>Modifier</Text>
                        </Pressable>
                    ) : null}
                </View>

                <View style={{ paddingHorizontal: 16, gap: 12 }}>
                    <GlassCard>
                        {!editing ? (
                            <View style={{ gap: 10 }}>
                                <Row label="Prénom" value={user?.firstName || '—'} />
                                <Row label="Nom"    value={user?.lastName  || '—'} />
                            </View>
                        ) : (
                            <View style={{ gap: 12 }}>
                                <Field label="Prénom">
                                    <Input value={firstName} onChangeText={setFirst} placeholder="Prénom" />
                                </Field>
                                <Field label="Nom">
                                    <Input value={lastName} onChangeText={setLast} placeholder="Nom" />
                                </Field>

                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                                    <PrimaryButton
                                        label={loading ? 'Enregistrement…' : 'Enregistrer'}
                                        onPress={onSave}
                                        style={{ flex: 1 } as any}
                                        disabled={loading}
                                    />
                                    <Pressable
                                        onPress={() => setEditing(false)}
                                        style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.9 }]}
                                    >
                                        <Text style={styles.ghostLabel}>Annuler</Text>
                                    </Pressable>
                                </View>
                            </View>
                        )}
                    </GlassCard>

                    <GlassCard>
                        <View style={{ gap: 8 }}>
                            <Text style={styles.sectionTitle}>Sécurité</Text>
                            <Text style={styles.muted}>Vous pouvez vous déconnecter de cet appareil.</Text>
                            <PrimaryButton
                                label={signingOut ? 'Déconnexion…' : 'Se déconnecter'}
                                onPress={onLogout}
                                disabled={signingOut}
                                style={{ marginTop: 8 } as any}
                            />
                        </View>
                    </GlassCard>

                    <View style={{ height: 24 + insets.bottom }} />
                </View>

                {signingOut && (
                    <View pointerEvents="auto" style={styles.blocker}>
                        <ActivityIndicator size="large" color="#fff" />
                        <Text style={{ color: '#fff', marginTop: 10, fontWeight: '700' }}>Déconnexion…</Text>
                    </View>
                )}
            </View>
        </View>
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


function Row({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
        </View>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <View>
            <Text style={styles.fieldLabel}>{label}</Text>
            {children}
        </View>
    );
}

function Input(props: any) {
    return (
        <View style={styles.inputWrap}>
            <TextInput
                {...props}
                placeholderTextColor="rgba(255,255,255,0.55)"
                style={styles.input}
                autoCapitalize="words"
                autoCorrect
            />
        </View>
    );
}


const styles = StyleSheet.create({
    fill: { flex: 1 },
    transparent: { backgroundColor: 'transparent' },

    header: {
        backgroundColor: 'transparent',
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        marginRight: 2,
    },
    avatarText: { color: '#fff', fontWeight: '900', fontSize: 16 },

    title: { color: '#fff', fontSize: 22, fontWeight: '900' },
    subtitle: { color: 'rgba(255,255,255,0.82)', marginTop: 2 },

    editBtn: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        backgroundColor: 'rgba(15,16,24,0.22)',
    },
    editBtnLabel: { color: '#fff', fontWeight: '800' },

    sectionTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
    muted: { color: 'rgba(255,255,255,0.70)' },

    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 6,
    },
    rowLabel: { color: 'rgba(255,255,255,0.62)', width: 90 },
    rowValue: { color: '#fff', fontWeight: '700', flex: 1 },

    fieldLabel: { color: 'rgba(255,255,255,0.8)', marginBottom: 6, fontWeight: '700' },
    inputWrap: {
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        backgroundColor: 'rgba(15,16,24,0.28)',
    },
    input: {
        color: '#fff',
        height: 48,
        paddingHorizontal: 12,
        fontWeight: '600',
    },

    ghost: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        backgroundColor: 'rgba(15,16,24,0.18)',
    },
    ghostLabel: { color: '#fff', fontWeight: '800' },

    blocker: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.8)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    blob: {
        position: 'absolute',
        borderRadius: 9999,
        opacity: 1,
    },
});
