// app/(auth)/register.tsx
import React, { useState } from 'react';
import { View, Text, Alert, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/store/auth';

export default function Register() {
    const router = useRouter();
    const register = useAuth((s) => s.register);
    const loading = useAuth((s) => s.loading);

    const [firstName, setFirst] = useState('');
    const [lastName, setLast] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPass] = useState('');

    async function onSubmit() {
        try {
            await register({
                email: email.trim(),
                password,
                firstName: firstName || undefined,
                lastName: lastName || undefined,
            });
            router.replace('/(tabs)');
        } catch {
            Alert.alert('Erreur', "Inscription impossible. Vérifie l'email et le mot de passe (8+).");
        }
    }

    return (
        <View style={{ flex: 1, padding: 20, gap: 12, justifyContent: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800' }}>Créer un compte</Text>

            <View style={{ backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
                <TextInput placeholder="Prénom (optionnel)" value={firstName} onChangeText={setFirst} style={{ height: 48 }} />
            </View>

            <View style={{ backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
                <TextInput placeholder="Nom (optionnel)" value={lastName} onChangeText={setLast} style={{ height: 48 }} />
            </View>

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
                    placeholder="Mot de passe (8+ caractères)"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPass}
                    style={{ height: 48 }}
                />
            </View>

            <Pressable
                onPress={onSubmit}
                style={{ height: 52, borderRadius: 999, backgroundColor: '#7A5AF8', alignItems: 'center', justifyContent: 'center' }}
            >
                <Text style={{ color: 'white', fontWeight: '700' }}>
                    {loading ? 'Création…' : 'Créer mon compte'}
                </Text>
            </Pressable>

            <Pressable onPress={() => router.back()}>
                <Text style={{ color: '#7A5AF8', marginTop: 10 }}>Déjà un compte ? Se connecter</Text>
            </Pressable>
        </View>
    );
}
