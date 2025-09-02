import React from 'react';
import { View, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import AuroraTabBar from '../../components/AuroraTabBar';
import { useAuth } from '../../src/store/auth';

const { width: W, height: H } = Dimensions.get('window');
const TABBAR_CLEARANCE = 16;

export default function TabsLayout() {
    const insets      = useSafeAreaInsets();
    const initialized = useAuth((s) => s.initialized);
    const user        = useAuth((s) => s.user);

    if (!initialized) {
        return (
            <LinearGradient colors={['#1a1440', '#1b1f5c', '#0d1030']} style={styles.fill}>
                <AuroraBackground />
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#ffffff" />
                </View>
            </LinearGradient>
        );
    }

    if (!user) return <Redirect href="/(auth)/login" />;

    return (
        <LinearGradient colors={['#1a1440', '#1b1f5c', '#0d1030']} style={styles.fill}>
            <AuroraBackground />

            <SafeAreaView edges={['top']} style={styles.safe}>
                <Tabs
                    sceneContainerStyle={{ backgroundColor: 'transparent' }}
                    screenOptions={{ headerShown: false }}
                    tabBar={(props) => <AuroraTabBar {...props} />}
                >
                    <Tabs.Screen name="index"   options={{ title: 'Accueil' }} />
                    <Tabs.Screen name="profile" options={{ title: 'Profil'  }} />
                </Tabs>

                <View style={{ height: insets.bottom + TABBAR_CLEARANCE }} />
            </SafeAreaView>
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

const styles = StyleSheet.create({
    fill: { flex: 1 },
    safe: { flex: 1, backgroundColor: 'transparent' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    blob: {
        position: 'absolute',
        borderRadius: 9999,
        opacity: 1,
    },
});
