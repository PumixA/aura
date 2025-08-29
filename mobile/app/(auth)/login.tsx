// app/(auth)/login.tsx
import React, { useState } from 'react';
import { View, Text, Alert, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/store/auth';

export default function Login() {
    const router = useRouter();
    const login = useAuth((s) => s.login);
    const loading = useAuth((s) => s.loading);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    async function onSubmit() {
        try {
            await login(email.trim(), password);
            router.replace('/(tabs)');
        } catch {
            Alert.alert('Erreur', 'Identifiants invalides ou serveur indisponible.');
        }
    }

    return (
        <View style={{ flex: 1, padding: 20, gap: 12, justifyContent: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800' }}>Se connecter</Text>

            <View style={{ backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
                <TextInput
                    placeholder="Email"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                    style={{ height: 48 }}
                />
            </View>

            <View style={{ backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
                <TextInput
                    placeholder="Mot de passe"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
                    style={{ height: 48 }}
                />
            </View>

            <Pressable
                onPress={onSubmit}
                style={{ height: 52, borderRadius: 999, backgroundColor: '#7A5AF8', alignItems: 'center', justifyContent: 'center' }}
            >
                <Text style={{ color: 'white', fontWeight: '700' }}>
                    {loading ? 'Connexion…' : 'Connexion'}
                </Text>
            </Pressable>

            <Pressable onPress={() => router.push('/(auth)/register')}>
                <Text style={{ color: '#7A5AF8', marginTop: 10 }}>Pas de compte ? Créer un compte</Text>
            </Pressable>
        </View>
    );
}
