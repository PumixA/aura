// components/ui.tsx
import React from 'react';
import {
    View,
    Text,
    Pressable,
    ViewStyle,
    TextStyle,
    StyleSheet,
    Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors } from '../constants/Colors';

/**
 * Liquid glass sombre, sans elevation :
 * - 1 seul background : BlurView (tint "dark")
 * - + 1 voile sombre unique (overlay) pour assombrir et améliorer le contraste
 * - Bordure fine
 * - overflow: 'hidden' + borderRadius -> pas de fuites
 */

type CardProps = {
    children: React.ReactNode;
    style?: ViewStyle;
    padding?: number;
    /** "dark" (défaut) ou "light" selon le décor dessous */
    tint?: 'light' | 'default' | 'dark';
    /** Opacité du voile sombre par-dessus le blur (0 à 1) — défaut 0.22  */
    overlayOpacity?: number;
    /** Intensité du blur (défaut 26) */
    intensity?: number;
};

export function GlassCard({
                              children,
                              style,
                              padding = 16,
                              tint = 'dark',
                              overlayOpacity = 0.22,
                              intensity = 26,
                          }: CardProps) {
    return (
        <View style={[styles.cardWrap, style]}>
            {/* Unique background = blur */}
            <BlurView tint={tint} intensity={intensity} style={StyleSheet.absoluteFill} />

            {/* Voile sombre unique (UNIQUEMENT) pour unifier et assombrir */}
            <View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFillObject,
                    {
                        backgroundColor:
                            tint === 'dark'
                                ? `rgba(15,16,24,${overlayOpacity})`
                                : `rgba(255,255,255,${Math.min(overlayOpacity, 0.18)})`,
                    },
                ]}
            />

            {/* Bordure fine */}
            <View pointerEvents="none" style={styles.cardBorder} />

            {/* Contenu */}
            <View style={{ padding }}>{children}</View>
        </View>
    );
}

type PrimaryButtonProps = {
    label: string;
    onPress?: () => void;
    style?: ViewStyle;
    labelStyle?: TextStyle;
    disabled?: boolean;
    /** Variante "glass" (transparent) ou "solid" (défaut) */
    variant?: 'solid' | 'glass';
};

export function PrimaryButton({
                                  label,
                                  onPress,
                                  style,
                                  labelStyle,
                                  disabled,
                                  variant = 'solid',
                              }: PrimaryButtonProps) {
    if (variant === 'glass') {
        // Bouton verre : même principe -> blur + unique overlay
        return (
            <Pressable
                onPress={onPress}
                disabled={disabled}
                style={({ pressed }) => [
                    styles.btnGlass,
                    pressed && { transform: [{ scale: 0.995 }] },
                    disabled && { opacity: 0.6 },
                    style,
                ]}
            >
                <BlurView tint="dark" intensity={22} style={StyleSheet.absoluteFill} />
                <View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFillObject,
                        { backgroundColor: 'rgba(15,16,24,0.18)' }, // voile unique
                    ]}
                />
                <View pointerEvents="none" style={styles.btnGlassBorder} />
                <Text style={[styles.btnGlassLabel, labelStyle]}>{label}</Text>
            </Pressable>
        );
    }

    // Bouton plein (solid) cohérent avec la charte
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => [
                styles.btnSolid,
                pressed && { transform: [{ scale: 0.995 }] },
                disabled && { opacity: 0.6 },
                style,
            ]}
        >
            <Text style={[styles.btnSolidLabel, labelStyle]}>{label}</Text>
        </Pressable>
    );
}

/* ===================== Styles ===================== */

const R = 22;

const styles = StyleSheet.create({
    /* ---- Card ---- */
    cardWrap: {
        position: 'relative',
        overflow: 'hidden',
        borderRadius: R,
        // Bordure appliquée via cardBorder pour rester au-dessus du blur
        // Ombre légère iOS uniquement (pas d'elevation Android)
        shadowColor: '#000',
        shadowOpacity: Platform.OS === 'ios' ? 0.12 : 0,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
    },
    cardBorder: {
        position: 'absolute',
        inset: 0 as any,
        borderRadius: R,
        borderWidth: 1,
        borderColor: Colors.glass.border, // devrait être semi-blanc dans ta palette
    },

    /* ---- Buttons ---- */
    btnSolid: {
        minHeight: 54,
        paddingHorizontal: 18,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.primary.solid,
        shadowColor: '#000',
        shadowOpacity: Platform.OS === 'ios' ? 0.10 : 0,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
    },
    btnSolidLabel: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 16,
    },

    btnGlass: {
        minHeight: 54,
        paddingHorizontal: 18,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    btnGlassBorder: {
        position: 'absolute',
        inset: 0 as any,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
    },
    btnGlassLabel: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 16,
    },
});
