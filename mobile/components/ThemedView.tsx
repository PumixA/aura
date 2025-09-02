// components/ThemedView.tsx
import React from 'react';
import { View, type ViewProps } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';

export type ThemedViewProps = ViewProps & {
    lightColor?: string;
    darkColor?: string;
};

/**
 * View thémée :
 * - par défaut, 'background' devient transparent (via le hook) pour laisser voir le gradient.
 * - si lightColor/darkColor sont fournis, ils priment.
 */
export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) {
    const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');
    return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
