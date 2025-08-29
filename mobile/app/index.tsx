// app/index.tsx
import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/store/auth';

export default function Index() {
    const initialized = useAuth((s) => s.initialized);
    const user = useAuth((s) => s.user);

    if (!initialized) return null;                 // évite un rendu intermédiaire instable
    if (!user) return <Redirect href="/(auth)/login" />;  // pas connecté → login
    return <Redirect href="/(tabs)" />;            // connecté → onglets
}
