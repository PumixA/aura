import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function AuroraTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();

    return (
        <SafeAreaView edges={['bottom']} style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 6) }]}>
            <View style={styles.shadow}>
                <BlurView intensity={35} tint="dark" style={styles.bar}>
                    <View style={styles.inner}>
                        {state.routes.map((route, index) => {
                            const { options } = descriptors[route.key];
                            const label =
                                options.tabBarLabel ?? options.title ?? route.name;

                            const isFocused = state.index === index;

                            const onPress = () => {
                                const event = navigation.emit({
                                    type: 'tabPress',
                                    target: route.key,
                                    canPreventDefault: true,
                                });
                                if (!isFocused && !event.defaultPrevented) {
                                    navigation.navigate(route.name);
                                }
                            };

                            const onLongPress = () => {
                                navigation.emit({ type: 'tabLongPress', target: route.key });
                            };

                            const iconName =
                                route.name === 'index'
                                    ? (isFocused ? 'home' : 'home-outline')
                                    : route.name === 'profile'
                                        ? (isFocused ? 'person' : 'person-outline')
                                        : (isFocused ? 'ellipse' : 'ellipse-outline');

                            return (
                                <Pressable
                                    key={route.key}
                                    accessibilityRole="button"
                                    accessibilityState={isFocused ? { selected: true } : {}}
                                    onPress={onPress}
                                    onLongPress={onLongPress}
                                    style={({ pressed }) => [styles.tab, pressed && { opacity: 0.85 }]}
                                >
                                    <Ionicons
                                        name={iconName as any}
                                        size={22}
                                        color={isFocused ? '#B9A6FF' : 'rgba(255,255,255,0.8)'}
                                        style={{ marginBottom: 2 }}
                                    />
                                    <Text style={[styles.label, isFocused && styles.labelActive]}>
                                        {String(label)}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </BlurView>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        backgroundColor: 'transparent',
    },
    shadow: {
        marginHorizontal: 16,
        borderRadius: 22,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 0,
    },
    bar: {
        overflow: 'hidden',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        backgroundColor: 'transparent',
    },
    inner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: 10,
        height: 64,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        borderRadius: 16,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.85)',
    },
    labelActive: {
        color: '#ffffff',
    },
});
