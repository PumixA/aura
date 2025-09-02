import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuth } from '../src/store/auth';

export default function RootLayout() {
    const init = useAuth((s) => s.init);

    useEffect(() => {
        init();
    }, [init]);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <StatusBar style="light" />
                <Stack screenOptions={{ headerShown: false }} />
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
