// app/(auth)/register.tsx
import React, { useState, useMemo } from 'react';
import {
    KeyboardAvoidingView,
    ScrollView,
    Platform,
    ActivityIndicator,
    Alert,
    View,
    Text,
    TextInput,
    Pressable,
    StyleSheet,
    Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../../src/store/auth';
import { PrimaryButton } from '../../components/ui';

const { width: W, height: H } = Dimensions.get('window');

export default function Register() {
    const router   = useRouter();
    const register = useAuth((s) => s.register);
    const loading  = useAuth((s) => s.loading);

    const [firstName, setFirst] = useState('');
    const [lastName,  setLast]  = useState('');
    const [email,     setEmail] = useState('');
    const [password,  setPass]  = useState('');
    const [reveal,    setReveal] = useState(false);

    const canSubmit = useMemo(
        () => email.trim().length > 3 && password.length >= 8,
        [email, password]
    );

    async function onSubmit() {
        if (!canSubmit) return;
        try {
            await register({
                email: email.trim(),
                password,
                firstName: firstName || undefined,
                lastName:  lastName  || undefined,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace('/(tabs)');
        } catch {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert(
                'Erreur',
                "Inscription impossible. Vérifie l'email et le mot de passe (8+)."
            );
        }
    }

    return (
        <View style={{ flex: 1 }}>
            {/* Fond gradient + blobs (cohérent avec les autres pages) */}
            <LinearGradient colors={['#1a1440', '#1b1f5c', '#0d1030']} style={StyleSheet.absoluteFill} />
            <AuroraBackground />

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.header}>
                        <Text style={styles.title}>Créer un compte</Text>
                        <Text style={styles.subtitle}>Rejoins l’aventure ✨</Text>
                    </View>

                    {/* Prénom (optionnel) */}
                    <View style={styles.inputWrap}>
                        <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.8)" style={styles.leftIcon} />
                        <TextInput
                            placeholder="Prénom (optionnel)"
                            placeholderTextColor="rgba(255,255,255,0.55)"
                            value={firstName}
                            onChangeText={setFirst}
                            style={styles.input}
                            autoCapitalize="words"
                        />
                    </View>

                    {/* Nom (optionnel) */}
                    <View style={styles.inputWrap}>
                        <Ionicons name="person-circle-outline" size={18} color="rgba(255,255,255,0.8)" style={styles.leftIcon} />
                        <TextInput
                            placeholder="Nom (optionnel)"
                            placeholderTextColor="rgba(255,255,255,0.55)"
                            value={lastName}
                            onChangeText={setLast}
                            style={styles.input}
                            autoCapitalize="words"
                        />
                    </View>

                    {/* Email */}
                    <View style={styles.inputWrap}>
                        <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.8)" style={styles.leftIcon} />
                        <TextInput
                            placeholder="Email"
                            placeholderTextColor="rgba(255,255,255,0.55)"
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                            value={email}
                            onChangeText={setEmail}
                            style={styles.input}
                            returnKeyType="next"
                        />
                    </View>

                    {/* Mot de passe */}
                    <View style={styles.inputWrap}>
                        <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.8)" style={styles.leftIcon} />
                        <TextInput
                            placeholder="Mot de passe (8+ caractères)"
                            placeholderTextColor="rgba(255,255,255,0.55)"
                            secureTextEntry={!reveal}
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={password}
                            onChangeText={setPass}
                            style={styles.input}
                            returnKeyType="go"
                            onSubmitEditing={onSubmit}
                        />
                        <Pressable onPress={() => setReveal((v) => !v)} hitSlop={8} style={styles.rightIconBtn}>
                            <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color="rgba(255,255,255,0.8)" />
                        </Pressable>
                    </View>

                    {/* CTA */}
                    <PrimaryButton
                        label={loading ? 'Création…' : 'Créer mon compte'}
                        onPress={onSubmit}
                        disabled={loading || !canSubmit}
                        style={{ marginTop: 10 } as any}
                    />

                    {/* Lien login */}
                    <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.92 }]}>
                        <Text style={styles.linkText}>Déjà un compte ? Se connecter</Text>
                    </Pressable>

                    {false && loading && (
                        <View style={{ marginTop: 12, alignItems: 'center' }}>
                            <ActivityIndicator color="#fff" />
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

/* ---- Fond aurora (blobs) identique aux autres écrans ---- */
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

/* ---- Styles ---- */
const styles = StyleSheet.create({
    scroll: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 18,
        paddingVertical: 24,
    },

    header: { marginBottom: 20, alignItems: 'center' },
    title: {
        fontSize: 28,
        fontWeight: '900',
        color: '#fff',
        marginBottom: 6,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.82)',
        textAlign: 'center',
    },

    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        backgroundColor: 'rgba(15,16,24,0.28)', // verre sombre
        height: 52,
        paddingHorizontal: 12,
        marginTop: 14,
    },
    leftIcon: { marginRight: 8 },
    rightIconBtn: { padding: 6, marginLeft: 6 },
    input: {
        flex: 1,
        fontSize: 16,
        color: '#fff',
        fontWeight: '600',
    },

    linkBtn: { alignSelf: 'center', marginTop: 12 },
    linkText: { color: '#fff', fontWeight: '700' },

    blob: {
        position: 'absolute',
        borderRadius: 9999,
        opacity: 1,
    },
});
