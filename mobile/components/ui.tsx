// src/components/ui.tsx
import React from 'react';
import {
    Text,
    View,
    TouchableOpacity,
    TextInput,
    ViewStyle,
    StyleSheet,
} from 'react-native';

const Colors = {
    text: '#0f1220',
    background: '#F8F9FC',
    card: 'rgba(255,255,255,0.88)',
    border: 'rgba(15,18,32,0.08)',
    primary: '#7A5AF8',
    primaryText: '#ffffff',
};

export const Card: React.FC<React.PropsWithChildren<{ style?: ViewStyle }>> = ({
                                                                                   children,
                                                                                   style,
                                                                               }) => <View style={[styles.card, style]}>{children}</View>;

export const PrimaryButton: React.FC<{
    title: string;
    onPress?: () => void;
    disabled?: boolean;
}> = ({ title, onPress, disabled }) => (
    <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        disabled={disabled}
        style={[styles.button, disabled && { opacity: 0.6 }]}
    >
        <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
);

export const Input: React.FC<{
    placeholder?: string;
    value?: string;
    onChangeText?: (t: string) => void;
    secureTextEntry?: boolean;
}> = ({ placeholder, value, onChangeText, secureTextEntry }) => (
    <View style={styles.inputWrap}>
        <TextInput
            placeholder={placeholder}
            placeholderTextColor={'#9aa3b2'}
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            secureTextEntry={secureTextEntry}
            autoCapitalize="none"
            autoCorrect={false}
        />
    </View>
);

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.card,
        borderRadius: 24,
        padding: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.border,
    },
    button: {
        height: 52,
        paddingHorizontal: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        backgroundColor: Colors.primary,
    },
    buttonText: {
        color: Colors.primaryText,
        fontWeight: '700',
        fontSize: 16,
    },
    inputWrap: {
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.border,
    },
    input: {
        height: 48,
        paddingHorizontal: 14,
        color: Colors.text,
        fontSize: 16,
    },
});
