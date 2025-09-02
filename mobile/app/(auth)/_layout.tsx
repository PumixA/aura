import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';

import { Colors } from '../../constants/Colors';

export default function AuthLayout() {
    return (
        <LinearGradient
            colors={[Colors.primary.solid, '#3d2fb1']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
        >
            <SafeAreaView style={{ flex: 1 }}>
                <Stack screenOptions={{ headerShown: false }} />
            </SafeAreaView>
        </LinearGradient>
    );
}
